import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as replyChoice from './index.js';

type Id = { Params: { id: string } };

export function replyChoiceRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  app.get<Id>('/posts/:id/reply-choice', async (req) => replyChoice.forPost(db, requireUser(req), id.parse(req.params).id));
  app.put<Id>('/posts/:id/reply-choice', async (req) =>
    replyChoice.set(db, requireUser(req), id.parse(req.params).id, replyChoice.SetAudience.parse(req.body).audience),
  );
}
