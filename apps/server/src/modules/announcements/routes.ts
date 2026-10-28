import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as announcements from './index.js';

const Id = z.object({ id: z.uuid() });

export function announcementRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/announcements', async (req) => ({ announcements: await announcements.activeFor(db, requireUser(req)) }));

  app.post('/announcements/:id/dismiss', async (req) => {
    const userId = requireUser(req);
    await announcements.dismiss(db, userId, Id.parse(req.params).id);
    return { dismissed: true };
  });

  app.get('/admin/announcements', async (req) => {
    await requireAdmin(requireUser(req));
    return { announcements: await announcements.list(db) };
  });

  app.post('/admin/announcements', async (req, reply) => {
    const userId = requireUser(req);
    await requireAdmin(userId);
    const created = await announcements.create(db, userId, announcements.NewAnnouncement.parse(req.body ?? {}));
    reply.code(201);
    return { announcement: created };
  });

  app.post('/admin/announcements/:id/end', async (req) => {
    await requireAdmin(requireUser(req));
    return { announcement: await announcements.end(db, Id.parse(req.params).id) };
  });
}
