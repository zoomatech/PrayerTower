import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as radio from './index.js';

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

  app.get('/me/radio-prayers', async (req) => {
    const userId = requireUser(req);
    return { radioPrayers: await radio.mine(db, userId) };
  });
}
