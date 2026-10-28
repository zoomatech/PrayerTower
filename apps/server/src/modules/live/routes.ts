import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as live from './index.js';

// Live video rooms (docs/LIVE_VIDEO.md).
export function liveRoutes(app: FastifyInstance, db: Db) {
  app.get('/live', async (req) => live.liveNow(db, requireUser(req)));

  app.post('/live', async (req, reply) => reply.code(201).send(await live.start(db, requireUser(req), live.Start.parse(req.body))));

  app.post('/live/:id/end', async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return live.end(db, requireUser(req), id);
  });

  app.get('/admin/live-settings', async (req) => {
    if (!(await hasRole(db, requireUser(req), 'admin'))) throw forbidden('Admins only');
    return { settings: await live.settings(db) };
  });

  app.patch('/admin/live-settings', async (req) => {
    if (!(await hasRole(db, requireUser(req), 'admin'))) throw forbidden('Admins only');
    return { settings: await live.updateSettings(db, live.SettingsPatch.parse(req.body)) };
  });
}
