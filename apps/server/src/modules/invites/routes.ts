import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as invites from './index.js';

/** Public: the sign-up screen asks whether to show the invite code field. */
export function signupConfigRoutes(app: FastifyInstance, db: Db) {
  app.get('/signup-config', async () => ({ inviteOnly: await invites.inviteOnly(db) }));
}

export function inviteRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/admin/invites', async (req) => {
    await requireAdmin(requireUser(req));
    const [inviteOnly, list] = await Promise.all([invites.inviteOnly(db), invites.list(db)]);
    return { inviteOnly, invites: list };
  });

  app.post('/admin/invites', async (req, reply) => {
    const userId = requireUser(req);
    await requireAdmin(userId);
    const created = await invites.create(db, userId, invites.NewInvites.parse(req.body ?? {}));
    reply.code(201);
    return { invites: created };
  });

  app.post<{ Params: { code: string } }>('/admin/invites/:code/revoke', async (req) => {
    await requireAdmin(requireUser(req));
    return { invite: await invites.revoke(db, req.params.code) };
  });

  app.patch('/admin/invite-settings', async (req) => {
    await requireAdmin(requireUser(req));
    const { inviteOnly } = z.object({ inviteOnly: z.boolean() }).parse(req.body);
    return { inviteOnly: await invites.setInviteOnly(db, inviteOnly) };
  });
}
