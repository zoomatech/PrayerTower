import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as split from './index.js';

type Id = { Params: { id: string } };
const id = z.object({ id: z.uuid() });
const cents = z.object({ cents: z.coerce.number().int().min(0).max(100_000_000).optional() });

export function givingSplitRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/giving-split', async (req) => ({ split: await split.mine(db, requireUser(req)) }));
  app.put('/me/giving-split', async (req) => ({ split: await split.setMine(db, requireUser(req), split.Choice.parse(req.body).percent) }));
  app.get<Id>('/people/:id/giving-split', async (req) => {
    const { id: memberId } = id.parse(req.params);
    const q = cents.parse(req.query);
    return { split: await split.forMember(db, requireUser(req), memberId, q.cents ?? null) };
  });
  app.get<Id>('/posts/:id/giving-split', async (req) => {
    const { id: postId } = id.parse(req.params);
    return { split: await split.forPost(db, requireUser(req), postId) };
  });
}
