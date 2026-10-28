import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as macroNeeds from './index.js';

export function macroNeedRoutes(app: FastifyInstance, db: Db) {
  app.get('/macro-needs', async (req) => ({ needs: await macroNeeds.featured(db, requireUser(req)) }));

  // Staff (admins and moderators) feature a macro need.
  app.post('/macro-needs', async (req, reply) => {
    const userId = requireUser(req);
    const input = macroNeeds.NewMacroNeed.parse(req.body);
    const need = await withTx(db, (tx) => macroNeeds.create(tx, userId, input));
    reply.code(201);
    return need;
  });

  app.post<{ Params: { id: string } }>('/macro-needs/:id/end', async (req) => {
    await macroNeeds.end(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/macro-needs/:id/helped', async (req) => ({
    helpers: await macroNeeds.markHelped(db, requireUser(req), req.params.id),
  }));
}
