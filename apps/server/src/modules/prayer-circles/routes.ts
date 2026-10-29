import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as circles from './index.js';

type Id = { Params: { id: string } };

export function prayerCircleRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  const member = z.object({ id: z.uuid(), userId: z.uuid() });
  app.get('/me/circles', async (req) => circles.mine(db, requireUser(req)));
  app.post('/circles', async (req, reply) => {
    const userId = requireUser(req);
    const input = circles.NewCircle.parse(req.body);
    const r = await withTx(db, (tx) => circles.create(tx, userId, input));
    reply.code(201);
    return r;
  });
  app.post('/circles/join', async (req) => circles.join(db, requireUser(req), circles.Join.parse(req.body).code));
  app.get<Id>('/circles/:id', async (req) => circles.get(db, requireUser(req), id.parse(req.params).id));
  app.put<Id>('/circles/:id/welcome', async (req) => circles.setWelcome(db, requireUser(req), id.parse(req.params).id, circles.Welcome.parse(req.body).text));
  app.post<Id>('/circles/:id/welcome/seen', async (req) => circles.welcomeSeen(db, requireUser(req), id.parse(req.params).id));
  app.post<Id>('/circles/:id/invite', async (req) => circles.invite(db, requireUser(req), id.parse(req.params).id));
  app.post<Id>('/circles/:id/leave', async (req) => withTx(db, (tx) => circles.leave(tx, requireUser(req), id.parse(req.params).id)));
  app.delete<{ Params: { id: string; userId: string } }>('/circles/:id/members/:userId', async (req) => {
    const p = member.parse(req.params);
    return circles.removeMember(db, requireUser(req), p.id, p.userId);
  });
  app.post<Id>('/circles/:id/posts', async (req, reply) => {
    const userId = requireUser(req);
    const { body } = circles.NewCirclePost.parse(req.body);
    const r = await withTx(db, (tx) => circles.post(tx, userId, id.parse(req.params).id, body));
    reply.code(201);
    return r;
  });
  app.post<Id>('/circle-posts/:id/replies', async (req, reply) => {
    const userId = requireUser(req);
    const { body } = circles.NewCircleReply.parse(req.body);
    const r = await withTx(db, (tx) => circles.reply(tx, userId, id.parse(req.params).id, body));
    reply.code(201);
    return r;
  });
  app.post<Id>('/circle-posts/:id/pray', async (req) => circles.pray(db, requireUser(req), id.parse(req.params).id));
  app.post<Id>('/circle-posts/:id/update', async (req) => circles.update(db, requireUser(req), id.parse(req.params).id, circles.Update.parse(req.body)));
  app.delete<Id>('/circle-posts/:id', async (req) => circles.removePost(db, requireUser(req), id.parse(req.params).id));
}
