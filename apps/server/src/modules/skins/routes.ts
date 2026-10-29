import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as skins from './index.js';

type Id = { Params: { id: string } };

export function skinRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  // Member skin ideas.
  app.get('/me/theme-proposals', async (req) => ({
    proposals: await skins.mine(db, requireUser(req)),
  }));
  app.post('/me/theme-proposals', async (req, reply) => {
    const proposal = await skins.propose(db, requireUser(req), skins.NewProposal.parse(req.body));
    reply.code(201);
    return { proposal };
  });

  // Skin gallery.
  app.get('/skins/gallery', async (req) => ({ skins: await skins.gallery(db, requireUser(req)) }));
  app.put<{ Params: { slug: string } }>('/skins/:slug/like', async (req) => ({ skins: await skins.like(db, requireUser(req), req.params.slug, true) }));
  app.delete<{ Params: { slug: string } }>('/skins/:slug/like', async (req) => ({ skins: await skins.like(db, requireUser(req), req.params.slug, false) }));

  // Admin → Feed skins.
  app.get('/admin/skin-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await skins.settings(db) };
  });
  app.patch('/admin/skin-settings', async (req) => {
    await requireAdmin(req);
    return {
      settings: await skins.updateSettings(db, skins.SettingsPatch.parse(req.body)),
    };
  });
  app.get('/admin/theme-proposals', async (req) => {
    await requireAdmin(req);
    return { proposals: await skins.list(db) };
  });
  app.post<Id>('/admin/theme-proposals/:id/approve', async (req) => {
    const adminId = await requireAdmin(req);
    return withTx(db, (tx) => skins.approve(tx, adminId, req.params.id, skins.Review.parse(req.body ?? {})));
  });
  app.post<Id>('/admin/theme-proposals/:id/decline', async (req) => {
    const adminId = await requireAdmin(req);
    return skins.decline(db, adminId, req.params.id, skins.Review.parse(req.body ?? {}));
  });
}
