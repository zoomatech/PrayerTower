import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '../../db.js';
import * as posts from '../posts/index.js';
import { signMedia } from '../posts/index.js';
import { chooseTheme, FEED_FILTERS, getFeed, themeChoices } from './index.js';

export function feedRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null = null) {
  app.get('/feed', async (req) => {
    const { page, pageSize, filter } = z
      .object({
        page: z.coerce.number().int().min(0).default(0),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
        filter: z.enum(FEED_FILTERS).default('all'),
      })
      .parse(req.query);
    const feed = await getFeed(db, requireUser(req), page, pageSize, filter);
    return { ...feed, posts: await signMedia(storage, feed.posts) };
  });

  // Your branch (Vine 2.0): all your own requests, newest first, on one branch of the vine.
  app.get('/me/branch', async (req) => {
    const userId = requireUser(req);
    const { rows } = await db.query<{ id: string }>(
      `select id from public.posts where user_id = $1 and moderation_status <> 'removed' order by created_at desc limit 100`,
      [userId],
    );
    return { posts: await signMedia(storage, await posts.cards(db, rows.map((r) => r.id), userId)) };
  });

  // Scripture leaves for the Vine feed, from the viewer's communities.
  app.get('/scripture-leaves', async (req) => {
    const userId = requireUser(req);
    const { rows } = await db.query(
      `select id, reference, text, translation from public.scripture_leaves
        where active and community_id = any (select community_id from public.community_memberships where user_id = $1)
        order by id`,
      [userId],
    );
    return { leaves: rows };
  });

  app.get('/me/feed-themes', async (req) => themeChoices(db, requireUser(req)));

  app.put('/me/feed-theme', async (req) => {
    const { slug } = z.object({ slug: z.string().min(1).max(40).nullable() }).parse(req.body);
    return chooseTheme(db, requireUser(req), slug);
  });
}
