import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as calm from './index.js';

type Id = { Params: { id: string } };

export function calmThreadRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  const requireModerator = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
    return userId;
  };
  app.get<Id>('/posts/:id/calm', async (req) => {
    requireUser(req);
    return calm.state(db, id.parse(req.params).id);
  });
  app.get('/moderation/calm-threads', async (req) => {
    await requireModerator(req);
    return { threads: await calm.queue(db) };
  });
  app.post<Id>('/moderation/calm-threads/:id', async (req) => {
    const moderatorId = await requireModerator(req);
    return calm.decide(db, moderatorId, id.parse(req.params).id, calm.CalmDecision.parse(req.body));
  });
}
