import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import type { Converse } from '../ai/provider.js';
import * as live from '../live/index.js';
import * as practice from './index.js';

export function practiceModeRoutes(
  app: FastifyInstance,
  db: Db,
  deps: { converse: Converse | null; jaas: boolean; appStore: boolean; practicePurchases: boolean },
) {
  const requireAdmin = async (req: FastifyRequest) => {
    if (!(await hasRole(db, requireUser(req), 'admin'))) throw forbidden('Admins only');
  };
  // What is really connected, so the admin screen can say which switches do nothing.
  // practicePurchasesAllowed is false when the App Store is set to production.
  const connected = async () => ({
    ai: !!deps.converse,
    jaas: deps.jaas,
    videoServer: !!(await live.settings(db)).jitsi_url,
    appStore: deps.appStore,
    practicePurchasesAllowed: deps.practicePurchases,
  });
  app.get('/admin/practice-mode', async (req) => {
    await requireAdmin(req);
    return { settings: await practice.settings(db), connected: await connected() };
  });
  app.patch('/admin/practice-mode', async (req) => {
    await requireAdmin(req);
    return { settings: await practice.updateSettings(db, practice.SettingsPatch.parse(req.body)), connected: await connected() };
  });
}
