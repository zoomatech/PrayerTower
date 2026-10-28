import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as feedback from './index.js';

export function feedbackRoutes(app: FastifyInstance, db: Db) {
  app.post('/feedback', async (req, reply) => {
    const userId = requireUser(req);
    const id = await feedback.create(db, userId, feedback.NewFeedback.parse(req.body));
    reply.code(201);
    return { id };
  });
}
