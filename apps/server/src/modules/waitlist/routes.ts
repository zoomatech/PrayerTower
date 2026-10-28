import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as waitlist from './index.js';

/** Public: join the waitlist (the page itself is served with the website). */
export function waitlistJoinRoutes(app: FastifyInstance, db: Db) {
  app.post('/waitlist/join', async (req, reply) => {
    if (!(await waitlist.enabled(db))) throw notFound('Waitlist');
    await waitlist.join(db, waitlist.Join.parse(req.body));
    reply.code(201);
    return { ok: true };
  });
}

/** Admin → Waitlist. */
export function waitlistAdminRoutes(app: FastifyInstance, db: Db) {
  const admin = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };
  app.get('/admin/waitlist', async (req) => {
    await admin(requireUser(req));
    return { enabled: await waitlist.enabled(db), entries: await waitlist.list(db) };
  });
  app.post<{ Params: { id: string } }>('/admin/waitlist/:id/invite', async (req) => {
    const staffId = await admin(requireUser(req));
    const id = z.uuid().parse(req.params.id);
    return withTx(db, (tx) => waitlist.invite(tx, staffId, id));
  });
  app.delete<{ Params: { id: string } }>('/admin/waitlist/:id', async (req) => {
    await admin(requireUser(req));
    await waitlist.remove(db, z.uuid().parse(req.params.id));
    return { ok: true };
  });
}
