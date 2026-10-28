import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as quick from './index.js';

export function quickReactionRoutes(app: FastifyInstance, db: Db) {
  const params = z.object({ id: z.uuid(), kind: quick.QuickReaction });

  app.put<{ Params: { id: string; kind: string } }>('/posts/:id/quick-reactions/:kind', async (req) => {
    const { id, kind } = params.parse(req.params);
    return withTx(db, (tx) => quick.set(tx, requireUser(req), id, kind, true));
  });

  app.delete<{ Params: { id: string; kind: string } }>('/posts/:id/quick-reactions/:kind', async (req) => {
    const { id, kind } = params.parse(req.params);
    return withTx(db, (tx) => quick.set(tx, requireUser(req), id, kind, false));
  });
}
