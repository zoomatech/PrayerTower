import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as prayerActions from './index.js';

/** Shown with the Praying Now button. */
export const PRAYING_NOW_INTEGRITY_TEXT = 'Tapping means you are bringing this request before the Lord right now.';

export function prayerActionRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Params: { id: string } }>('/posts/:id/praying-now', async (req, reply) => {
    const userId = requireUser(req);
    const input = prayerActions.PrayingNow.parse(req.body ?? {});
    const result = await withTx(db, (tx) => prayerActions.prayingNow(tx, userId, req.params.id, input));
    reply.code(201);
    return { ...result, integrityText: PRAYING_NOW_INTEGRITY_TEXT };
  });
}
