import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { languages } from '../../language.js';
import * as deletion from './index.js';

export interface DeletionPageOptions {
  supabaseUrl: string;
  publishableKey: string | null;
  supportEmail: string | null;
  /** Open Circle's copy of the page, on its own domains and at /open-circle/account-deletion. */
  openCircle?: { name: string; hosts: string[] } | null;
}

/** Public routes: no sign-in. */
export function deletionPageRoutes(app: FastifyInstance, db: Db, opts: DeletionPageOptions) {
  const html = deletion.page(opts, 'en');
  const es = languages.spanish ? deletion.page(opts, 'es') : null;
  const oc = opts.openCircle ?? null;
  const ocRoot = oc ? deletion.page(opts, 'en', { name: oc.name, nested: false }) : null;
  app.get('/account-deletion', async (req, reply) =>
    reply.type('text/html; charset=utf-8').send(ocRoot && oc!.hosts.includes(req.hostname.toLowerCase()) ? ocRoot : html),
  );
  if (oc) {
    const nested = deletion.page(opts, 'en', { name: oc.name, nested: true });
    app.get('/open-circle/account-deletion', async (_req, reply) => reply.type('text/html; charset=utf-8').send(nested));
  }
  app.get('/es/account-deletion', async (_req, reply) => (es ? reply.type('text/html; charset=utf-8').send(es) : reply.redirect('/account-deletion', 302)));

  app.post('/account-deletion/requests', async (req, reply) => {
    await deletion.createRequest(db, deletion.NewRequest.parse(req.body));
    reply.code(201);
    return { ok: true };
  });
}
