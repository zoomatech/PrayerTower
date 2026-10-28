import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as legal from './index.js';

export function legalRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };
  const id = (req: FastifyRequest) => z.uuid().parse((req.params as { id: string }).id);

  // A moderator sends a reported item to the admins for a law-enforcement review.
  app.post<{ Params: { id: string } }>('/moderation/items/:id/escalate', async (req, reply) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
    const { note } = z.object({ note: z.string().trim().min(1).max(4000) }).parse(req.body);
    reply.code(201);
    return withTx(db, (tx) => legal.escalate(tx, userId, id(req), note));
  });

  app.get('/admin/legal/settings', async (req) => {
    await requireAdmin(req);
    return { settings: await legal.settings(db) };
  });
  app.patch('/admin/legal/settings', async (req) => {
    await requireAdmin(req);
    return { settings: await legal.updateSettings(db, legal.SettingsPatch.parse(req.body)) };
  });

  app.get('/admin/legal/cases', async (req) => {
    await requireAdmin(req);
    return { cases: await legal.list(db) };
  });
  app.post('/admin/legal/cases', async (req, reply) => {
    const adminId = await requireAdmin(req);
    const input = legal.NewCase.parse(req.body);
    reply.code(201);
    return withTx(db, (tx) => legal.create(tx, adminId, input));
  });
  app.get<{ Params: { id: string } }>('/admin/legal/cases/:id', async (req) => {
    await requireAdmin(req);
    return legal.get(db, id(req));
  });
  app.post<{ Params: { id: string } }>('/admin/legal/cases/:id/notes', async (req) => {
    const adminId = await requireAdmin(req);
    const { body } = z.object({ body: z.string().trim().min(1).max(4000) }).parse(req.body);
    return withTx(db, (tx) => legal.addNote(tx, adminId, id(req), body));
  });
  app.post<{ Params: { id: string } }>('/admin/legal/cases/:id/close', async (req) => {
    await requireAdmin(req);
    return withTx(db, (tx) => legal.close(tx, id(req)));
  });

  app.post<{ Params: { id: string } }>('/admin/legal/cases/:id/holds', async (req, reply) => {
    const adminId = await requireAdmin(req);
    const input = legal.NewHold.parse(req.body ?? {});
    reply.code(201);
    return withTx(db, (tx) => legal.placeHold(tx, adminId, id(req), input));
  });
  app.post<{ Params: { id: string } }>('/admin/legal/holds/:id/refresh', async (req) => {
    await requireAdmin(req);
    return withTx(db, (tx) => legal.refreshHold(tx, id(req)));
  });
  app.post<{ Params: { id: string } }>('/admin/legal/holds/:id/extend', async (req) => {
    await requireAdmin(req);
    const { days } = z.object({ days: z.number().int().min(1).max(3650) }).parse(req.body);
    return withTx(db, (tx) => legal.extendHold(tx, id(req), days));
  });
  app.post<{ Params: { id: string } }>('/admin/legal/holds/:id/release', async (req) => {
    await requireAdmin(req);
    const caseId = await withTx(db, (tx) => legal.release(tx, id(req)));
    return legal.get(db, caseId);
  });
  app.get<{ Params: { id: string } }>('/admin/legal/holds/:id/export', async (req, reply) => {
    await requireAdmin(req);
    const out = await legal.exportHold(db, id(req));
    return reply.header('content-disposition', `attachment; filename="evidence-hold-${out.hold.id}.json"`).header('cache-control', 'no-store').send(out);
  });
}
