import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as checkBack from './index.js';

export function checkBackRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  app.get<{ Params: { id: string } }>('/posts/:id/check-back', async (req) => checkBack.mine(db, requireUser(req), id.parse(req.params).id));
  app.put<{ Params: { id: string } }>('/posts/:id/check-back', async (req) => {
    const userId = requireUser(req);
    const { days } = checkBack.CheckBackPatch.parse(req.body);
    return withTx(db, (tx) => checkBack.set(tx, userId, id.parse(req.params).id, days));
  });
}
