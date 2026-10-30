// Admin → Radio: the band plan (band-plan.ts) and urgent prayers (urgent.ts). Admins switch
// them; radio operators (the control operator) read them and flag urgent requests.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as bandPlan from './band-plan.js';
import * as urgent from './urgent.js';

export function radioPlanRoutes(app: FastifyInstance, db: Db) {
  const role = (...roles: ('admin' | 'radio_operator')[]) => async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, ...roles))) throw forbidden(roles.length > 1 ? 'Radio operators only' : 'Admins only');
    return userId;
  };
  const admin = role('admin');
  const operator = role('admin', 'radio_operator');
  const plan = async () => ({ ...(await bandPlan.settings(db)), outlook: await bandPlan.outlook(db) });

  app.get('/admin/band-plan', async (req) => {
    await operator(req);
    return plan();
  });
  app.patch('/admin/band-plan', async (req) => {
    await admin(req);
    await bandPlan.update(db, bandPlan.PlanPatch.parse(req.body));
    return plan();
  });

  app.get('/admin/urgent-radio', async (req) => {
    await operator(req);
    return urgent.list(db);
  });
  app.patch('/admin/urgent-radio', async (req) => {
    await admin(req);
    await urgent.updateSettings(db, urgent.SettingsPatch.parse(req.body));
    return urgent.list(db);
  });
  // Flag a request: it leaves in the next window (404 while urgent prayers are off).
  app.post('/admin/urgent-radio', async (req, reply) => {
    const staffId = await operator(req);
    const { postId } = z.object({ postId: z.uuid() }).parse(req.body);
    reply.code(201);
    return withTx(db, (tx) => urgent.flag(tx, staffId, postId));
  });
  app.delete<{ Params: { id: string } }>('/admin/urgent-radio/:id', async (req) => {
    await operator(req);
    await urgent.unflag(db, z.uuid().parse(req.params.id));
    return urgent.list(db);
  });
}
