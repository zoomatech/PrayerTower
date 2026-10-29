import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as live from './index.js';
import type { JaasKeys } from './jaas.js';
import * as practice from '../practice-mode/index.js';

/** The page a practice room opens (no sign-in: the in-app browser has none; the name is long and random). */
export function practiceRoomRoutes(app: FastifyInstance) {
  app.get('/live/practice/:name', async (req, reply) => {
    const { name } = z.object({ name: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/) }).parse(req.params);
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(practice.practiceRoomPage(name));
  });
}

// Live video rooms (docs/LIVE_VIDEO.md).
export function liveRoutes(app: FastifyInstance, db: Db, jaas: JaasKeys | null = null) {
  // The host's proxy ends TLS, so its x-forwarded-proto says whether members reached us on https.
  const opts = (req: FastifyRequest) => ({ jaas, base: `${String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]}://${req.host}` });
  app.get('/live', async (req) => live.liveNow(db, requireUser(req), opts(req)));

  app.post('/live', async (req, reply) => reply.code(201).send(await live.start(db, requireUser(req), live.Start.parse(req.body), opts(req))));

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
