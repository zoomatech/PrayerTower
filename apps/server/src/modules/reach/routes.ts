import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as tokens from '../tokens/index.js';
import * as reach from './index.js';

export function reachRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/power-prayer', async (req) => reach.status(db, requireUser(req)));

  // Power Prayer: spread this request to live pray-ers who don't know the poster.
  app.post<{ Params: { id: string } }>('/posts/:id/power-prayer', async (req, reply) => {
    const userId = requireUser(req);
    const { idempotencyKey } = z.object({ idempotencyKey: z.string().min(1).max(100) }).parse(req.body);
    const powerPrayer = await withTx(db, (tx) => reach.powerPrayer(tx, userId, req.params.id, idempotencyKey));
    reply.code(201);
    return { powerPrayer, next: await reach.status(db, userId), balance: await tokens.balanceOf(db, userId) };
  });
}
