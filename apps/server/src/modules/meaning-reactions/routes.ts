import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as meanings from './index.js';

type Id = { Params: { id: string } };

export function meaningReactionRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });

  app.get('/reaction-meanings', async (req) => {
    requireUser(req);
    return { emoji: await meanings.tree(db) };
  });

  app.get<Id>('/posts/:id/meanings', async (req) => {
    const { id: postId } = id.parse(req.params);
    return { leaves: await meanings.list(db, requireUser(req), postId) };
  });

  app.put<Id>('/posts/:id/meanings', async (req) => {
    const { id: postId } = id.parse(req.params);
    const input = meanings.Choice.parse(req.body);
    return { leaves: await withTx(db, (tx) => meanings.choose(tx, requireUser(req), postId, input)) };
  });

  app.delete<{ Params: { id: string; emoji: string } }>('/posts/:id/meanings/:emoji', async (req) => {
    const { id: postId, emoji } = z.object({ id: z.uuid(), emoji: z.string().min(1).max(30) }).parse(req.params);
    return { leaves: await withTx(db, (tx) => meanings.remove(tx, requireUser(req), postId, emoji)) };
  });
}
