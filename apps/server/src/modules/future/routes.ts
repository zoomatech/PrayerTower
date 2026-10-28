import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as fund from '../common-fund/index.js';
import * as future from './index.js';

// Switched-off groundwork: token store and Common Prayer Fund page. The AI conversation is in modules/ai.
export function futureRoutes(app: FastifyInstance, db: Db) {
  app.get('/token-store', async (req) => {
    requireUser(req);
    return future.store(db);
  });

  app.post('/token-store/purchases', async (req) => future.purchase(db, requireUser(req), future.Purchase.parse(req.body)));

  app.get('/common-prayer-fund', async (req) => {
    requireUser(req);
    return fund.report(db);
  });

}
