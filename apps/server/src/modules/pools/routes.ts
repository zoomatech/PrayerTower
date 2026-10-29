import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as tokens from '../tokens/index.js';
import * as pools from './index.js';

const Key = z.object({ idempotencyKey: z.string().min(1).max(100) });

export function poolRoutes(app: FastifyInstance, db: Db) {
  // Open pools; with ?postId, whether the member can draw from each for that request.
  app.get<{ Querystring: { postId?: string } }>('/token-pools', async (req) => ({
    pools: await pools.list(db, requireUser(req), { postId: req.query.postId }),
  }));
  app.get('/me/token-pools', async (req) => ({ pools: await pools.list(db, requireUser(req), { mine: true }) }));

  app.post('/token-pools', async (req, reply) => {
    const userId = requireUser(req);
    const input = pools.NewPool.parse(req.body);
    const id = await withTx(db, (tx) => pools.create(tx, userId, input));
    reply.code(201);
    return { id, balance: await tokens.balanceOf(db, userId) };
  });

  app.post<{ Params: { id: string } }>('/token-pools/:id/fund', async (req) => {
    const userId = requireUser(req);
    const body = Key.extend({ amount: z.number().int().min(1).max(1_000_000) }).parse(req.body);
    const { matched } = await withTx(db, (tx) => pools.fund(tx, userId, req.params.id, body.amount, body.idempotencyKey));
    return { matched, poolBalance: await tokens.poolBalance(db, req.params.id), balance: await tokens.balanceOf(db, userId) };
  });

  app.post<{ Params: { id: string } }>('/token-pools/:id/close', async (req) => {
    const userId = requireUser(req);
    await withTx(db, (tx) => pools.close(tx, userId, req.params.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/token-pools/:id/draw', async (req) => {
    const userId = requireUser(req);
    const { postId } = z.object({ postId: z.uuid() }).parse(req.body);
    return withTx(db, (tx) => pools.draw(tx, userId, req.params.id, postId));
  });
}
