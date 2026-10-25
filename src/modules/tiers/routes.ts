import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as tiers from './index.js';

export function tierRoutes(app: FastifyInstance, db: Db) {
  // Always visible to the member themself, including on the private (anonymous) track.
  app.get('/me/tier', async (req) => tiers.status(db, requireUser(req)));
}
