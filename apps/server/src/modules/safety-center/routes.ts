import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as center from './index.js';

type Id = { Params: { id: string } };

export function safetyCenterRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/safety', async (req) => ({ safety: await center.overview(db, requireUser(req)) }));

  app.get<Id>('/people/:id/mute', async (req) => ({ muted: await center.isMuted(db, requireUser(req), z.uuid().parse(req.params.id)) }));

  app.put<Id>('/people/:id/mute', async (req) => {
    await center.mute(db, requireUser(req), z.uuid().parse(req.params.id));
    return { muted: true };
  });

  app.delete<Id>('/people/:id/mute', async (req) => {
    await center.unmute(db, requireUser(req), z.uuid().parse(req.params.id));
    return { muted: false };
  });

  // Admin → Safety center: the switch.
  app.get('/admin/safety-center', async (req) => {
    if (!(await hasRole(db, requireUser(req), 'admin'))) throw forbidden('Admins only');
    return { enabled: await center.enabled(db) };
  });

  app.patch('/admin/safety-center', async (req) => {
    if (!(await hasRole(db, requireUser(req), 'admin'))) throw forbidden('Admins only');
    return center.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
  });
}
