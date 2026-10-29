import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as fund from '../common-fund/index.js';
import * as store from '../store/index.js';
import * as future from './index.js';

// Switched-off groundwork: token store and Common Prayer Fund page. The AI conversation is in modules/ai.
export function futureRoutes(app: FastifyInstance, db: Db, appleVerifier: store.AppleVerifier | null = null, practicePurchases = false) {
  app.get('/token-store', async (req) => {
    requireUser(req);
    // practice: the app sends practice purchases instead of using the App Store (Admin → Practice mode).
    return { ...(await future.store(db)), practice: await store.practiceOn(db, appleVerifier, practicePurchases) };
  });

  // A StoreKit 2 purchase: the signed transaction is checked with Apple before tokens are credited (once).
  app.post('/token-store/purchases', async (req, reply) => {
    const userId = requireUser(req);
    const input = store.Purchase.parse(req.body);
    return reply.code(201).send({ purchase: await withTx(db, (tx) => store.purchase(tx, appleVerifier, userId, input, practicePurchases)) });
  });

  app.get('/me/token-purchases', async (req) => ({ purchases: await store.mine(db, requireUser(req)) }));

  app.get('/common-prayer-fund', async (req) => {
    requireUser(req);
    return fund.report(db);
  });

}
