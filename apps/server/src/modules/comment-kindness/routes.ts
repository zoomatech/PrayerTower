import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as kindness from './index.js';

type Id = { Params: { id: string } };

export function commentKindnessRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  app.get<Id>('/posts/:id/comment-kindness', async (req) => kindness.forPost(db, requireUser(req), id.parse(req.params).id));
  app.put<Id>('/comments/:id/heart', async (req) => {
    const userId = requireUser(req);
    const { on } = kindness.HeartPatch.parse(req.body);
    return withTx(db, (tx) => kindness.heart(tx, userId, id.parse(req.params).id, on));
  });
  app.post<Id>('/comments/:id/thanks', async (req) => {
    const userId = requireUser(req);
    return withTx(db, (tx) => kindness.thank(tx, userId, id.parse(req.params).id));
  });
  app.get('/me/quiet-counts', async (req) => kindness.quietPrefs(db, requireUser(req)));
  app.put('/me/quiet-counts', async (req) => kindness.setQuietPrefs(db, requireUser(req), kindness.QuietPatch.parse(req.body)));
}
