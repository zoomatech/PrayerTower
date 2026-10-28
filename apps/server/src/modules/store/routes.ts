import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTx, type Db } from '../../db.js';
import * as store from './index.js';

/** App Store Server Notifications V2 (refunds). No sign-in: Apple's signature on the payload is the check. */
export function storeNotificationRoutes(app: FastifyInstance, db: Db, appleVerifier: store.AppleVerifier | null) {
  app.post('/store/apple/notifications', async (req) => {
    const { signedPayload } = z.object({ signedPayload: z.string().min(20).max(100_000) }).parse(req.body);
    return withTx(db, (tx) => store.handleNotification(tx, appleVerifier, signedPayload));
  });
}
