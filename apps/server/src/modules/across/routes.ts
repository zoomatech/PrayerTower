import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as across from './index.js';

export function acrossRoutes(app: FastifyInstance, db: Db) {
  app.get('/across', async (req) => ({ card: await across.today(db, requireUser(req)) }));
}
