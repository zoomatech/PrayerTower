import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as kindMilestones from './index.js';

export function kindMilestoneRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/kind-milestones', async (req) => kindMilestones.mine(db, requireUser(req)));
  app.post('/me/kind-milestones/seen', async (req) => kindMilestones.markSeen(db, requireUser(req)));
}
