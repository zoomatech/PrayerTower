import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as surveys from './index.js';

export function surveyRoutes(app: FastifyInstance, db: Db) {
  app.get('/surveys', async (req) => ({ surveys: await surveys.forMember(db, requireUser(req)) }));

  app.post<{ Params: { id: string } }>('/surveys/:id/responses', async (req, reply) => {
    const userId = requireUser(req);
    const id = z.uuid().parse(req.params.id);
    reply.code(201);
    return withTx(db, (tx) => surveys.answer(tx, userId, id, surveys.Answers.parse(req.body)));
  });

  const adminOnly = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  app.get('/admin/surveys', async (req) => {
    await adminOnly(requireUser(req));
    return { surveys: await surveys.list(db) };
  });

  app.post('/admin/surveys', async (req, reply) => {
    const adminId = await adminOnly(requireUser(req));
    const input = surveys.NewSurvey.parse(req.body);
    reply.code(201);
    return { survey: await withTx(db, (tx) => surveys.create(tx, adminId, input)) };
  });

  app.patch<{ Params: { id: string } }>('/admin/surveys/:id', async (req) => {
    await adminOnly(requireUser(req));
    const id = z.uuid().parse(req.params.id);
    const input = surveys.SurveyPatch.parse(req.body);
    return { survey: await withTx(db, (tx) => surveys.update(tx, id, input)) };
  });

  app.delete<{ Params: { id: string } }>('/admin/surveys/:id', async (req) => {
    await adminOnly(requireUser(req));
    await withTx(db, (tx) => surveys.remove(tx, z.uuid().parse(req.params.id)));
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/admin/surveys/:id/results', async (req) => {
    await adminOnly(requireUser(req));
    return surveys.results(db, z.uuid().parse(req.params.id));
  });
}
