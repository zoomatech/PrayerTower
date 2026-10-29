import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as backupCodes from './backup-codes.js';
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

  // Backup codes (Admin → Sign-in security → Backup codes, off).
  app.get('/me/two-step/backup-codes', async (req) => backupCodes.status(db, requireUser(req)));
  app.post('/me/two-step/backup-codes', async (req) => backupCodes.generate(db, requireUser(req)));
  // Allowed from a password-only sign-in (auth.ts): this is how a member who lost their phone gets back in.
  app.post('/me/two-step/recover', async (req) => backupCodes.recover(db, requireUser(req), backupCodes.Recover.parse(req.body).code));

  // A member lost their phone and their codes: an admin turns two-step sign-in off after checking it's them.
  app.post<{ Params: { id: string } }>('/admin/people/:id/two-step-reset', async (req) => {
    await requireAdmin(requireUser(req));
    return backupCodes.adminReset(db, z.uuid().parse(req.params.id));
  });
}
