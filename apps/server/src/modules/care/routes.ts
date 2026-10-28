import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as care from './index.js';

type Id = { Params: { id: string } };

export function careRoutes(app: FastifyInstance, db: Db) {
  app.get('/care', async (req) => {
    requireUser(req);
    return care.options(db);
  });

  app.get('/me/care-requests', async (req) => ({ requests: await care.mine(db, requireUser(req)) }));

  app.post('/care-requests', async (req, reply) => {
    const input = care.NewCareRequest.parse(req.body);
    const r = await withTx(db, (tx) => care.request(tx, requireUser(req), input));
    reply.code(201);
    return r;
  });

  app.get('/care/queue', async (req) => ({ requests: await care.queue(db, requireUser(req)) }));

  app.post<Id>('/care-requests/:id/claim', async (req) => withTx(db, (tx) => care.claim(tx, requireUser(req), req.params.id)));

  app.post<Id>('/care-requests/:id/close', async (req) => {
    await care.close(db, requireUser(req), req.params.id);
    return { ok: true };
  });
}
