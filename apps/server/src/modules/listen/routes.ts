// Public radio routes that need no sign-in, limited per IP address (app.ts).
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { notFound } from '../../errors.js';
import * as receipts from '../radio/receipts.js';

export function listenPublicRoutes(app: FastifyInstance, db: Db) {
  // A listener heard these prayers (fingerprints only): tells their senders, while receipts are on.
  app.post('/listen/heard', async (req) => {
    if (!(await receipts.enabled(db))) throw notFound('Radio receipts');
    const report = receipts.HeardReport.parse(req.body);
    return { matched: await withTx(db, (tx) => receipts.heard(tx, report)) };
  });
}
