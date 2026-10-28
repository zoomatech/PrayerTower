import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import * as deletion from './index.js';

export interface DeletionPageOptions {
  supabaseUrl: string;
  publishableKey: string | null;
  supportEmail: string | null;
}

/** Public routes: no sign-in. */
export function deletionPageRoutes(app: FastifyInstance, db: Db, opts: DeletionPageOptions) {
  const html = deletion.page(opts, 'en');
  const es = deletion.page(opts, 'es');
  app.get('/account-deletion', async (_req, reply) => reply.type('text/html; charset=utf-8').send(html));
  app.get('/es/account-deletion', async (_req, reply) => reply.type('text/html; charset=utf-8').send(es));

  app.post('/account-deletion/requests', async (req, reply) => {
    await deletion.createRequest(db, deletion.NewRequest.parse(req.body));
    reply.code(201);
    return { ok: true };
  });
}
