import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as partners from './index.js';

export function partnerRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/partner', async (req) => partners.partner(db, requireUser(req)));
  app.post('/me/partner/join', async (req) => {
    partners.Join.parse(req.body);
    return withTx(db, (tx) => partners.join(tx, requireUser(req)));
  });
  app.post('/me/partner/leave', async (req) => partners.leave(db, requireUser(req)));
  app.post('/me/partner/check-in', async (req) => partners.checkIn(db, requireUser(req), partners.CheckIn.parse(req.body)));
}
