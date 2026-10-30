import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as radio from './index.js';
import * as followup from './followup.js';
import * as prayingToo from './praying-too.js';
import * as signalQueue from './signal-queue.js';
import * as receipts from './receipts.js';

export function radioRoutes(app: FastifyInstance, db: Db) {
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
    };
  });

  // My signal queue (signal-queue.ts): 404 while the switch is off.
  app.get('/me/signal-queue', async (req) => ({ signals: await signalQueue.mine(db, requireUser(req)) }));

  app.get('/me/radio-prayers', async (req) => {
    const userId = requireUser(req);
    return { radioPrayers: await radio.mine(db, userId) };
  });
}
