import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as live from './index.js';

export function liveActivityRoutes(app: FastifyInstance, db: Db) {
  app.post('/me/live-activities', async (req, reply) => {
    reply.code(201);
    return live.start(db, requireUser(req), live.Start.parse(req.body));
  });
  app.post('/me/live-activities/end', async (req) => {
    const { pushToken } = z.object({ pushToken: z.string().max(400) }).parse(req.body);
    await live.end(db, requireUser(req), pushToken);
    return { ended: true };
  });
}
