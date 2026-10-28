import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as groups from './index.js';

export function groupRoutes(app: FastifyInstance, db: Db) {
  app.get('/groups', async (req) => groups.list(db, requireUser(req)));

  app.post('/groups', async (req, reply) => {
    const userId = requireUser(req);
    const input = groups.NewGroup.parse(req.body);
    const group = await withTx(db, (tx) => groups.create(tx, userId, input));
    reply.code(201);
    return group;
  });

  app.post('/groups/join', async (req) => {
    const { code } = z.object({ code: z.string().trim().min(1).max(40) }).parse(req.body);
    return groups.joinByCode(db, requireUser(req), code);
  });

  app.get<{ Params: { id: string } }>('/groups/:id', async (req) => groups.get(db, requireUser(req), req.params.id));

  app.post<{ Params: { id: string } }>('/groups/:id/join', async (req) => {
    await groups.join(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/groups/:id/leave', async (req) => {
    await withTx(db, (tx) => groups.leave(tx, requireUser(req), req.params.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/groups/:id/prayer-list', async (req, reply) => {
    const { postId } = z.object({ postId: z.uuid() }).parse(req.body);
    await groups.addToList(db, requireUser(req), req.params.id, postId);
    reply.code(201);
    return { ok: true };
  });

  app.delete<{ Params: { id: string; postId: string } }>('/groups/:id/prayer-list/:postId', async (req) => {
    await groups.removeFromList(db, requireUser(req), req.params.id, req.params.postId);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/groups/:id/messages', async (req, reply) => {
    const userId = requireUser(req);
    const input = groups.NewGroupMessage.parse(req.body);
    const message = await withTx(db, (tx) => groups.send(tx, userId, req.params.id, input));
    reply.code(201);
    return { message };
  });
}
