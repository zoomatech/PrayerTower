import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as plan from './index.js';

// Bible reading plans: today's passage for members; plans for admins and pastors.
export function readingPlanRoutes(app: FastifyInstance, db: Db) {
  const Params = z.object({ id: z.uuid() });
  app.get('/reading-plan', async (req) => plan.today(db, requireUser(req)));
  app.post('/reading-plan/:id/read', async (req) => plan.markRead(db, requireUser(req), Params.parse(req.params).id));
  app.get('/staff/reading-plans', async (req) => ({ plans: await plan.plans(db, requireUser(req)) }));
  app.post('/staff/reading-plans', async (req, reply) => {
    const userId = requireUser(req);
    const body = plan.NewPlan.parse(req.body);
    reply.code(201);
    return withTx(db, (tx) => plan.create(tx, userId, body));
  });
  app.post('/staff/reading-plans/:id/archive', async (req) => plan.archive(db, requireUser(req), Params.parse(req.params).id));
}
