import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as thankNote from './index.js';

type Id = { Params: { id: string } };

export function thankNoteRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  app.get<Id>('/posts/:id/thank-note', async (req) => thankNote.forPost(db, requireUser(req), id.parse(req.params).id));
  app.post<Id>('/posts/:id/thank-note', async (req, reply) => {
    const userId = requireUser(req);
    const { body } = thankNote.NewThankNote.parse(req.body);
    const r = await withTx(db, (tx) => thankNote.send(tx, userId, id.parse(req.params).id, body));
    reply.code(201);
    return r;
  });
  app.post<Id>('/posts/:id/thank-note/glad', async (req) => thankNote.glad(db, requireUser(req), id.parse(req.params).id));
}
