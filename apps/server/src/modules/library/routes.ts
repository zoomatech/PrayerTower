import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as library from './index.js';

// Scripture and ancient writings search (off by default).
export function libraryRoutes(app: FastifyInstance, db: Db) {
  app.get('/library', async (req) => library.overview(db, requireUser(req)));
  app.get('/library/search', async (req) => library.search(db, requireUser(req), library.Search.parse(req.query)));
}
