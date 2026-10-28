import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as communities from './index.js';

export function communityRoutes(app: FastifyInstance, db: Db) {
  app.get('/communities', async (req) => {
    const userId = requireUser(req);
    return { mine: await communities.mine(db, userId), choices: await communities.choices(db) };
  });

  app.post('/me/community', async (req) => {
    const { slug } = communities.Choose.parse(req.body);
    const userId = requireUser(req);
    return { community: await withTx(db, (tx) => communities.choose(tx, userId, slug)) };
  });

  const adminOnly = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/admin/communities', async (req) => {
    await adminOnly(requireUser(req));
    return { communities: await communities.all(db) };
  });

  app.patch<{ Params: { slug: string } }>('/admin/communities/:slug', async (req) => {
    await adminOnly(requireUser(req));
    return { community: await communities.update(db, req.params.slug, communities.Update.parse(req.body)) };
  });
}
