import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as messages from './index.js';

export function messageRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Params: { id: string } }>('/posts/:id/conversations', async (req) =>
    messages.start(db, requireUser(req), req.params.id, messages.StartConversation.parse(req.body ?? {})),
  );

  app.get('/me/conversations', async (req) => {
    const userId = requireUser(req);
    return { conversations: await messages.list(db, userId), unread: await messages.unreadCount(db, userId) };
  });

  app.get<{ Params: { id: string } }>('/conversations/:id', async (req) => messages.messages(db, requireUser(req), req.params.id));

  app.post<{ Params: { id: string } }>('/conversations/:id/messages', async (req, reply) => {
    const userId = requireUser(req);
    const input = messages.NewMessage.parse(req.body);
    const message = await withTx(db, (tx) => messages.send(tx, userId, req.params.id, input));
    reply.code(201);
    return { message };
  });

  app.post<{ Params: { id: string } }>('/conversations/:id/read', async (req) => {
    await messages.markRead(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.put<{ Params: { id: string } }>('/conversations/:id/block', async (req) => {
    await messages.setBlocked(db, requireUser(req), req.params.id, true);
    return { blocked: true };
  });

  app.delete<{ Params: { id: string } }>('/conversations/:id/block', async (req) => {
    await messages.setBlocked(db, requireUser(req), req.params.id, false);
    return { blocked: false };
  });
}
