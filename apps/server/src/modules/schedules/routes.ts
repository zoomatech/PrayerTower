import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as schedules from './index.js';

export function scheduleRoutes(app: FastifyInstance, db: Db) {
  // Give tokens to a request at a set time, once or weekly.
  app.post<{ Params: { id: string } }>('/posts/:id/scheduled-spends', async (req, reply) => {
    const schedule = await schedules.create(db, requireUser(req), req.params.id, schedules.NewSchedule.parse(req.body));
    reply.code(201);
    return { schedule };
  });
  app.get('/me/scheduled-spends', async (req) => ({ schedules: await schedules.mine(db, requireUser(req)) }));
  app.delete<{ Params: { id: string } }>('/scheduled-spends/:id', async (req) => {
    await schedules.cancel(db, requireUser(req), req.params.id);
    return { ok: true };
  });
}
