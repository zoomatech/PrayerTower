import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as security from './index.js';

export function securityRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (userId: string) => {
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };
  app.get('/admin/security-settings', async (req) => {
    await requireAdmin(requireUser(req));
    return { settings: await security.settings(db) };
  });
  app.patch('/admin/security-settings', async (req) => {
    await requireAdmin(requireUser(req));
    return { settings: await security.updateSettings(db, security.SettingsPatch.parse(req.body)) };
  });
}
