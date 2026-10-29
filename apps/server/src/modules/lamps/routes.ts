import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as lamps from './index.js';

// Lamp awards: thanks with a note, recognition only (no tokens).
export function lampRoutes(app: FastifyInstance, db: Db) {
  app.get('/people/:id/lamps', async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return lamps.received(db, requireUser(req), id);
  });
  app.post('/people/:id/lamps', async (req, reply) => {
    const userId = requireUser(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const input = lamps.NewLamp.parse(req.body);
    return reply.code(201).send(await withTx(db, (tx) => lamps.give(tx, userId, id, input)));
  });
}
