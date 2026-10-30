import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import * as adFines from '../ad-fines/index.js';
import { badgesOf } from '../churches/index.js';
import * as posts from '../posts/index.js';
import * as freshDays from '../fresh-days/index.js';
import { settings as practiceSettings } from '../practices/index.js';
import { prayerStats, setIntention } from '../prayer-stats/index.js';
import { MEDIA_BUCKET, signPhoto } from '../posts/media.js';
import { SPOKEN_BUCKET } from '../spoken-prayers/index.js';
import { exportData } from './export.js';
import * as accounts from './index.js';
import * as communities from '../communities/index.js';

export function accountRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null = null) {
  app.get('/me', async (req) => {
    const userId = requireUser(req);
    const profile = await accounts.getProfile(db, userId);
    if (!profile) throw notFound('Profile');
    const { photo_path, ...rest } = profile;
    return { profile: { ...rest, photo_url: await signPhoto(storage, photo_path) }, roles: await accounts.roles(db, userId), community: await communities.mine(db, userId) };
  });

  // A member's own ad fines (empty unless the switch was ever on).
  app.get('/me/ad-fines', async (req) => ({ fines: await adFines.list(db, { limit: 50 }, requireUser(req)) }));

  // Gentle prayer stats for Me, counted by days in the member's time zone.
  app.get('/me/prayer-stats', async (req) => {
    const { tz } = z.object({ tz: z.string().max(64).refine(accounts.validTimeZone, 'Unknown time zone').default('UTC') }).parse(req.query);
    return { stats: await prayerStats(db, requireUser(req), tz) };
  });

  // Fresh starts on days that matter (Admin → Growth practices, off): up to three of the member's own dates.
  app.get('/me/fresh-days', async (req) => ({ days: await freshDays.list(db, requireUser(req)) }));
  app.post('/me/fresh-days', async (req) => ({ days: await freshDays.add(db, requireUser(req), freshDays.NewDay.parse(req.body)) }));
  app.delete<{ Params: { id: string } }>('/me/fresh-days/:id', async (req) => ({
    days: await freshDays.remove(db, requireUser(req), z.uuid().parse(req.params.id)),
  }));

  // Weekly intention (Admin → Growth practices, off): how many days a week the member means to pray.
  app.put('/me/weekly-intention', async (req) => {
    const userId = requireUser(req);
    if (!(await practiceSettings(db)).weekly_intention_enabled) throw badRequest('Weekly intentions are off');
    const { days, tz } = z
      .object({ days: z.number().int().min(1).max(6).nullable(), tz: z.string().max(64).refine(accounts.validTimeZone, 'Unknown time zone').default('UTC') })
      .parse(req.body);
    await setIntention(db, userId, days);
    return { stats: await prayerStats(db, userId, tz) };
  });

  // The member's own profile photo: uploaded through /media/upload-url, then set here. It fills the locket on their posts.
  app.put('/me/photo', async (req) => {
    const userId = requireUser(req);
    const { storagePath } = accounts.PhotoPath.parse(req.body);
    const old = await accounts.setPhoto(db, userId, storagePath);
    if (storage && old) await storage.storage.from(MEDIA_BUCKET).remove([old]);
    return { photoUrl: await signPhoto(storage, storagePath) };
  });
  app.delete('/me/photo', async (req) => {
    const old = await accounts.setPhoto(db, requireUser(req), null);
    if (storage && old) await storage.storage.from(MEDIA_BUCKET).remove([old]);
    return { photoUrl: null };
  });

  app.patch('/me', async (req) => {
    const input = accounts.ProfileUpdate.parse(req.body);
    const { photo_path, ...profile } = await accounts.updateProfile(db, requireUser(req), input);
    return { profile: { ...profile, photo_url: await signPhoto(storage, photo_path) } };
  });

  // Download my data: one JSON file with everything on the member's account.
  app.get('/me/export', async (req, reply) => {
    const userId = requireUser(req);
    const data = await exportData(db, userId);
    const day = data.exportedAt.slice(0, 10);
    reply.header('content-disposition', `attachment; filename="my-data-${day}.json"`);
    reply.header('cache-control', 'no-store');
    return data;
  });

  // Delete my account. The app asks the member to type DELETE first.
  app.delete('/me', async (req) => {
    const userId = requireUser(req);
    z.object({ confirm: z.literal('DELETE') }).parse(req.body ?? {});
    // Voice recordings the member sent or received go with the account (the rows cascade).
    const { rows: audio } = await db.query<{ storage_path: string }>(
      'select storage_path from public.spoken_prayers where user_id = $1 or recipient_id = $1',
      [userId],
    );
    const paths = await withTx(db, (tx) => accounts.deleteAccount(tx, userId));
    if (storage && paths.length) await storage.storage.from(MEDIA_BUCKET).remove(paths);
    if (storage && audio.length) await storage.storage.from(SPOKEN_BUCKET).remove(audio.map((a) => a.storage_path));
    return { deleted: true };
  });

  app.get<{ Params: { id: string } }>('/people/:id', async (req) => {
    const viewerId = requireUser(req);
    const p = await accounts.getProfile(db, req.params.id);
    if (!p || p.deleted_at || (p.id !== viewerId && (await posts.blockedBetween(db, viewerId, p.id)))) throw notFound('Person');
    const [status, ids, badges] = await Promise.all([accounts.followStatus(db, viewerId, p.id), posts.namedPostIds(db, p.id, viewerId), badgesOf(db, [p.id])]);
    // An outside support link shows only while switched on, and only within the member's community.
    const { rows: link } = await db.query<{ show: boolean; squire: boolean }>(
      `select (select support_links_enabled from public.notebook_settings) and public.member_community_id($1) = public.member_community_id($2) as show,
              (select squire_board_enabled from public.notebook_settings) and public.member_community_id($1) is not distinct from public.member_community_id($2) as squire`,
      [viewerId, p.id],
    );
    return {
      person: {
        id: p.id,
        displayName: p.display_name,
        handle: p.handle,
        bio: p.bio,
        whyHere: p.why_here,
        pastor: badges.get(p.id) ?? null,
        supportUrl: link[0]?.show && p.support_url ? p.support_url : null,
        // On the public Prayer Squire track (opted in, not anonymous), while the board is on.
        squire: link[0]?.squire === true && p.squire_public && !p.anonymous_by_default,
        ...status,
      },
      posts: await posts.cards(db, ids, viewerId),
    };
  });

  app.put<{ Params: { id: string } }>('/people/:id/follow', async (req) => {
    await accounts.follow(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/people/:id/follow', async (req) => {
    await accounts.unfollow(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.get('/me/followers', async (req) => ({ people: await accounts.followers(db, requireUser(req)) }));
  app.get('/me/following', async (req) => ({ people: await accounts.following(db, requireUser(req)) }));
  app.get('/me/connections', async (req) => ({ people: await accounts.connections(db, requireUser(req)) }));
}
