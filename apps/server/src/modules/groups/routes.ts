import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as groups from './index.js';

type Id = { Params: { id: string } };

export function groupRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  app.get('/topic-groups', async (req) => groups.list(db, requireUser(req)));
  app.post('/topic-groups', async (req, reply) => {
    const userId = requireUser(req);
    const input = groups.NewGroup.parse(req.body);
    const r = await withTx(db, (tx) => groups.create(tx, userId, input));
    reply.code(201);
    return r;
  });
  app.get<Id>('/topic-groups/:id', async (req) => groups.get(db, requireUser(req), id.parse(req.params).id));
  app.post<Id>('/topic-groups/:id/join', async (req) => groups.join(db, requireUser(req), id.parse(req.params).id));
  app.post<Id>('/topic-groups/:id/leave', async (req) => withTx(db, (tx) => groups.leave(tx, requireUser(req), id.parse(req.params).id)));
  app.post<Id>('/topic-groups/:id/posts', async (req, reply) => {
    const r = await groups.post(db, requireUser(req), id.parse(req.params).id, groups.NewPost.parse(req.body).body);
    reply.code(201);
    return r;
  });
  app.post<Id>('/topic-group-posts/:id/comments', async (req, reply) => {
    const r = await groups.comment(db, requireUser(req), id.parse(req.params).id, groups.NewComment.parse(req.body).body);
    reply.code(201);
    return r;
  });
  app.post<Id>('/topic-group-posts/:id/pray', async (req) => groups.pray(db, requireUser(req), id.parse(req.params).id));
  app.delete<Id>('/topic-group-posts/:id', async (req) => groups.removePost(db, requireUser(req), id.parse(req.params).id));
  app.delete<Id>('/topic-group-comments/:id', async (req) => groups.removeComment(db, requireUser(req), id.parse(req.params).id));
}
