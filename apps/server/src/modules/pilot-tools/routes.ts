import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as pilot from './index.js';

export function pilotToolsRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  // The "Tell Steve" shortcut: whether to show it, and whose name it carries.
  app.get('/pilot/tell', async (req) => {
    requireUser(req);
    return pilot.tellFounder(db);
  });

  // The app reports a crash or an unexpected error here. Always 202: a member is never told the log is off.
  app.post('/pilot/errors', async (req, reply) => {
    const userId = requireUser(req);
    const r = pilot.AppErrorReport.parse(req.body);
    await pilot.record(db, { source: 'app', place: r.screen, message: r.message, detail: r.detail, platform: r.platform, appVersion: r.appVersion, userId });
    return reply.code(202).send({ ok: true });
  });

  app.get('/admin/pilot-tools', async (req) => {
    await requireAdmin(req);
    return { settings: await pilot.settings(db) };
  });
  app.patch('/admin/pilot-tools', async (req) => {
    await requireAdmin(req);
    return { settings: await pilot.updateSettings(db, pilot.SettingsPatch.parse(req.body)) };
  });
  app.get('/admin/errors', async (req) => {
    await requireAdmin(req);
    return { errors: await pilot.list(db, pilot.ErrorFilter.parse(req.query)) };
  });
  app.post<{ Params: { id: string } }>('/admin/errors/:id/resolve', async (req) => {
    await requireAdmin(req);
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    await pilot.resolve(db, String(id));
    return { ok: true };
  });
  app.get('/admin/feedback-summary', async (req) => {
    await requireAdmin(req);
    return { summary: await pilot.summary(db) };
  });
}
