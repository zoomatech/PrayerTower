import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { isSecular } from '../communities/index.js';
import * as prayerActions from './index.js';

/** Shown with the Praying Now button. */
export const PRAYING_NOW_INTEGRITY_TEXT = 'Tapping means you are bringing this request before the Lord right now.';
/** The same promise in Open Circle, the non-religious community. */
export const THINKING_OF_YOU_INTEGRITY_TEXT = 'Tapping means you are truly holding this person in your thoughts right now.';

export function prayerActionRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Params: { id: string } }>('/posts/:id/praying-now', async (req, reply) => {
    const userId = requireUser(req);
    const input = prayerActions.PrayingNow.parse(req.body ?? {});
    const result = await withTx(db, (tx) => prayerActions.prayingNow(tx, userId, req.params.id, input));
    reply.code(201);
    return { ...result, integrityText: (await isSecular(db, userId)) ? THINKING_OF_YOU_INTEGRITY_TEXT : PRAYING_NOW_INTEGRITY_TEXT };
  });
}
