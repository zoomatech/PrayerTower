import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as commitments from './index.js';

export function commitmentRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Params: { id: string } }>('/posts/:id/commitments', async (req, reply) => {
    const userId = requireUser(req);
    const input = commitments.NewCommitment.parse(req.body);
    const commitment = await withTx(db, (tx) => commitments.create(tx, userId, req.params.id, input));
    reply.code(201);
    return { commitment };
  });

  app.get('/me/commitments', async (req) => ({
    commitments: await commitments.list(db, requireUser(req)),
    note: 'This data helps us measure whether we are helping. WE DO NOT JUDGE.',
  }));

  app.post<{ Params: { id: string } }>('/commitments/:id/check-in', async (req) => {
    const userId = requireUser(req);
    const { durationSeconds } = z.object({ durationSeconds: z.number().int().min(0).max(86_400).optional() }).parse(req.body ?? {});
    return { commitment: await withTx(db, (tx) => commitments.checkIn(tx, userId, req.params.id, durationSeconds)) };
  });

  app.post<{ Params: { id: string } }>('/commitments/:id/snooze', async (req) => {
    const userId = requireUser(req);
    const { minutes } = z.object({ minutes: z.number().int().min(5).max(7 * 24 * 60) }).parse(req.body);
    return { commitment: await withTx(db, (tx) => commitments.snooze(tx, userId, req.params.id, minutes)) };
  });

  app.patch<{ Params: { id: string } }>('/commitments/:id', async (req) => {
    const userId = requireUser(req);
    const input = commitments.Edit.parse(req.body);
    return { commitment: await withTx(db, (tx) => commitments.edit(tx, userId, req.params.id, input)) };
  });
}
