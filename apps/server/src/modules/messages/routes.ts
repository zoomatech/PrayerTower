import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as messages from './index.js';

type Id = { Params: { id: string } };

export function messageRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/conversations', async (req) => ({ conversations: await messages.list(db, requireUser(req)) }));

  // A pray-er writes to the person they prayed for.
  app.post<Id>('/posts/:id/messages', async (req, reply) => {
    const input = messages.NewPrayerThread.parse(req.body);
    const r = await withTx(db, (tx) => messages.startPrayerThread(tx, requireUser(req), req.params.id, input));
    reply.code(201);
    return r;
  });

  app.post('/conversations/direct', async (req, reply) => {
    const input = messages.NewDirect.parse(req.body);
    const r = await withTx(db, (tx) => messages.startDirect(tx, requireUser(req), input));
    reply.code(201);
    return r;
  });

  app.post('/conversations/groups', async (req, reply) => {
    const input = messages.NewGroup.parse(req.body);
    const r = await withTx(db, (tx) => messages.createGroup(tx, requireUser(req), input));
    reply.code(201);
    return r;
  });

  app.get('/groups', async (req) => ({ groups: await messages.publicGroups(db, requireUser(req)) }));

  app.get<Id & { Querystring: { before?: string } }>('/conversations/:id', async (req) => {
    const { before } = z.object({ before: z.uuid().optional() }).parse(req.query);
    return messages.read(db, requireUser(req), req.params.id, before);
  });

  app.post<Id>('/conversations/:id/messages', async (req, reply) => {
    const input = messages.NewMessage.parse(req.body);
    const message = await withTx(db, (tx) => messages.send(tx, requireUser(req), req.params.id, input));
    reply.code(201);
    return { message };
  });

  app.post<Id>('/conversations/:id/read', async (req) => {
    await messages.markRead(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.post<Id>('/conversations/:id/accept', async (req) => {
    await messages.accept(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.post<Id>('/conversations/:id/decline', async (req) => {
    await messages.decline(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.post<Id>('/conversations/:id/join', async (req) => {
    await withTx(db, (tx) => messages.joinGroup(tx, requireUser(req), req.params.id));
    return { ok: true };
  });

  app.post<Id>('/conversations/:id/invite', async (req) => {
    const { userIds } = z.object({ userIds: z.array(z.uuid()).min(1).max(50) }).parse(req.body);
    return { invited: await withTx(db, (tx) => messages.invite(tx, requireUser(req), req.params.id, userIds)) };
  });

  app.get('/me/blocks', async (req) => ({ blocks: await messages.blocks(db, requireUser(req)) }));

  app.put<Id>('/people/:id/block', async (req) => {
    await messages.block(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.delete<Id>('/people/:id/block', async (req) => {
    await messages.unblock(db, requireUser(req), req.params.id);
    return { ok: true };
  });
}
