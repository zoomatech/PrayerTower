import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as radio from './index.js';
import * as followup from './followup.js';
import * as panel from './panel.js';
import * as prayingToo from './praying-too.js';
import * as signalQueue from './signal-queue.js';
import * as receipts from './receipts.js';
import * as posts from '../posts/index.js';

export function radioRoutes(app: FastifyInstance, db: Db) {
  // PrayerCast (Steve, 2026-11-02): a prayer sent by radio, with a required choice: posted
  // publicly to the feed, or PrayerCast privately (never shown, its words forgotten once sent).
  // One transaction: if it can't be sent, nothing is saved.
  app.post('/prayercast', async (req, reply) => {
    const userId = requireUser(req);
    const { visibility, idempotencyKey, ...rest } = req.body as Record<string, unknown> & { visibility?: unknown; idempotencyKey?: unknown };
    const choice = z.object({ visibility: z.enum(['public', 'private']), idempotencyKey: z.string().min(1).max(100) }).parse({ visibility, idempotencyKey });
    const input = posts.NewPost.parse({ ...rest, postType: 'prayer_request' });
    const out = await withTx(db, async (tx) => {
      const post = await posts.create(tx, userId, choice.visibility === 'private' ? { ...input, isAnonymous: true } : input);
      if (choice.visibility === 'private') await posts.makePrivateCast(tx, post.id);
      const radioPrayer = await radio.queue(tx, userId, post.id, choice.idempotencyKey);
      return { post, radioPrayer };
    });
    reply.code(201);
    // A private PrayerCast has no card: it is shown to no one, its author included.
    const card = choice.visibility === 'public' ? (await posts.cards(db, [out.post.id], userId))[0] : null;
    return { post: card, postId: out.post.id, radioPrayer: out.radioPrayer, harm: out.post.harm };
  });

  // Spend Priestly tokens (token_settings.radio_prayer_cost) to send this request out by radio.
  app.post<{ Params: { id: string } }>('/posts/:id/radio', async (req, reply) => {
    const userId = requireUser(req);
    const { idempotencyKey, amplify } = z
      .object({ idempotencyKey: z.string().min(1).max(100), amplify: z.boolean().default(false) })
      .parse(req.body);
    const radioPrayer = await withTx(db, (tx) => radio.queue(tx, userId, req.params.id, idempotencyKey, amplify));
    reply.code(201);
    return { radioPrayer };
  });

  // Prayer Cast: the public log of prayers that went out.
  app.get('/prayer-cast', async (req) => radio.castLog(db, requireUser(req)));

  // The app's Listen screen: shown while Admin → Radio has the listening page on.
  app.get('/radio/listen', async (req) => {
    requireUser(req);
    const s = await radio.stationSettings(db);
    return {
      enabled: s.listen_page_enabled,
      receipts: s.listen_page_enabled && (await receipts.enabled(db)),
      prayingToo: s.listen_page_enabled && (await prayingToo.enabled(db)),
      readAloud: s.listen_page_enabled && (await followup.loopSettings(db)).readAloud,
      panel: s.listen_page_enabled && (await panel.enabled(db)),
    };
  });

  // My signal queue (signal-queue.ts): 404 while the switch is off.
  app.get('/me/signal-queue', async (req) => ({ signals: await signalQueue.mine(db, requireUser(req)) }));

  app.get('/me/radio-prayers', async (req) => {
    const userId = requireUser(req);
    return { radioPrayers: await radio.mine(db, userId) };
  });
}
