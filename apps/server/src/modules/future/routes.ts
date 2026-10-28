import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as future from './index.js';

// Switched-off groundwork: token store, Common Prayer Fund page, AI conversation.
export function futureRoutes(app: FastifyInstance, db: Db) {
  app.get('/token-store', async (req) => {
    requireUser(req);
    return future.store(db);
  });

  app.post('/token-store/purchases', async (req) => future.purchase(db, requireUser(req), future.Purchase.parse(req.body)));

  app.get('/common-prayer-fund', async (req) => {
    requireUser(req);
    return future.commonFund(db);
  });

  app.get('/ai-chat', async (req) => {
    requireUser(req);
    return future.aiChatInfo(db);
  });

  app.post('/ai-chat', async (req) => future.aiChat(db, requireUser(req), future.AiChat.parse(req.body)));
}
