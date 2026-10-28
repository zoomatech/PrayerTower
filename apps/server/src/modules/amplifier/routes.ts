import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as amplifier from './index.js';

type Id = { Params: { id: string } };

// LIVE AMPLIFIER: the queue for licensed operators who read prayers on the air (off by default).
export function amplifierRoutes(app: FastifyInstance, db: Db) {
  app.get('/amplifier/queue', async (req) => ({ prayers: await amplifier.queue(db, requireUser(req)) }));

  app.get('/amplifier/readings', async (req) => ({ readings: await amplifier.mine(db, requireUser(req)) }));

  app.post('/amplifier/readings', async (req, reply) => {
    const userId = requireUser(req);
    const { radioPrayerId } = z.object({ radioPrayerId: z.uuid() }).parse(req.body);
    return reply.code(201).send({ reading: await withTx(db, (tx) => amplifier.claim(tx, userId, radioPrayerId)) });
  });

  app.post<Id>('/amplifier/readings/:id/read', async (req) => {
    const userId = requireUser(req);
    const id = z.uuid().parse(req.params.id);
    await withTx(db, (tx) => amplifier.markRead(tx, userId, id, amplifier.ReadInput.parse(req.body ?? {})));
    return { ok: true };
  });

  app.post<Id>('/amplifier/readings/:id/release', async (req) => {
    const userId = requireUser(req);
    await withTx(db, (tx) => amplifier.release(tx, userId, z.uuid().parse(req.params.id)));
    return { ok: true };
  });
}
