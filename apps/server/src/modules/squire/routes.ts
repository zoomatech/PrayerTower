import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as squire from './index.js';

// The opt-in Prayer Squire board.
export function squireRoutes(app: FastifyInstance, db: Db) {
  app.get('/squire-board', async (req) => squire.board(db, requireUser(req)));
  app.put('/me/squire-board', async (req) => squire.choose(db, requireUser(req), squire.Choice.parse(req.body)));
}
