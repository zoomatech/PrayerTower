import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as churches from './index.js';

// Member side of church partner onboarding. Admin review lives under /admin/churches.
export function churchRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/church', async (req) => ({ church: await churches.mine(db, requireUser(req)) }));

  app.post('/me/church', async (req, reply) => {
    const church = await churches.apply(db, requireUser(req), churches.Application.parse(req.body));
    reply.code(201);
    return { church };
  });

  app.put('/me/church', async (req) => ({ church: await churches.edit(db, requireUser(req), churches.Application.parse(req.body)) }));

  app.delete('/me/church', async (req) => {
    await churches.withdraw(db, requireUser(req));
    return { ok: true };
  });
}

export function churchAdminRoutes(app: FastifyInstance, db: Db, requireAdmin: (req: FastifyRequest) => Promise<string>) {
  app.get('/admin/churches', async (req) => {
    await requireAdmin(req);
    const { status } = z.object({ status: z.enum(churches.STATUSES).optional() }).parse(req.query);
    return { churches: await churches.list(db, status) };
  });

  app.post<{ Params: { id: string } }>('/admin/churches/:id/decision', async (req) => {
    const adminId = await requireAdmin(req);
    const input = churches.Decision.parse(req.body);
    return { church: await withTx(db, (tx) => churches.decide(tx, adminId, req.params.id, input)) };
  });
}
