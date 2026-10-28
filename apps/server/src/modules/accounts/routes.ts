import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { notFound } from '../../errors.js';
import * as adFines from '../ad-fines/index.js';
import { badgesOf } from '../churches/index.js';
import * as posts from '../posts/index.js';
import { prayerStats } from '../prayer-stats/index.js';
import { MEDIA_BUCKET } from '../posts/media.js';
import { SPOKEN_BUCKET } from '../spoken-prayers/index.js';
import { exportData } from './export.js';
import * as accounts from './index.js';
import * as communities from '../communities/index.js';

export function accountRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null = null) {
  app.get('/me', async (req) => {
    const userId = requireUser(req);
    const profile = await accounts.getProfile(db, userId);
    if (!profile) throw notFound('Profile');
    return { profile, roles: await accounts.roles(db, userId), community: await communities.mine(db, userId) };
  });

  // A member's own ad fines (empty unless the switch was ever on).
  app.get('/me/ad-fines', async (req) => ({ fines: await adFines.list(db, { limit: 50 }, requireUser(req)) }));

  // Gentle prayer stats for Me, counted by days in the member's time zone.
  app.get('/me/prayer-stats', async (req) => {
    const { tz } = z.object({ tz: z.string().max(64).refine(accounts.validTimeZone, 'Unknown time zone').default('UTC') }).parse(req.query);
    return { stats: await prayerStats(db, requireUser(req), tz) };
  });

  app.patch('/me', async (req) => {
    const input = accounts.ProfileUpdate.parse(req.body);
    return { profile: await accounts.updateProfile(db, requireUser(req), input) };
  });

  // Download my data: one JSON file with everything on the member's account.
  app.get('/me/export', async (req, reply) => {
    const userId = requireUser(req);
    const data = await exportData(db, userId);
    const day = data.exportedAt.slice(0, 10);
    reply.header('content-disposition', `attachment; filename="prayer-tower-data-${day}.json"`);
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
    return {
      person: { id: p.id, displayName: p.display_name, handle: p.handle, bio: p.bio, whyHere: p.why_here, pastor: badges.get(p.id) ?? null, ...status },
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
