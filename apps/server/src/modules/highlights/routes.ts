import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { highlights } from './index.js';

export function highlightRoutes(app: FastifyInstance, db: Db) {
  app.get('/highlights', async (req) => highlights(db, requireUser(req)));
}
