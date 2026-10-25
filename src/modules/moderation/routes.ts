import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as moderation from './index.js';

export function moderationRoutes(app: FastifyInstance, db: Db) {
  const requireModerator = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
    return userId;
  };

  app.post('/reports', async (req, reply) => {
    const item = await moderation.report(db, requireUser(req), moderation.Report.parse(req.body));
    reply.code(201);
    return { reportId: item.id };
  });

  app.get('/moderation/queue', async (req) => {
    await requireModerator(req);
    return { items: await moderation.pending(db) };
  });

  app.post<{ Params: { id: string } }>('/moderation/items/:id/decision', async (req) => {
    const moderatorId = await requireModerator(req);
    const decision = moderation.Decision.parse(req.body);
    await withTx(db, (tx) => moderation.decide(tx, moderatorId, req.params.id, decision));
    return { ok: true };
  });
}
