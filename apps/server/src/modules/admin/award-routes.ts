import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as awards from './awards.js';

type Id = { Params: { id: string } };
const Year = z.object({ year: z.coerce.number().int().min(2025).max(2200) });

export function awardRoutes(app: FastifyInstance, db: Db) {
  const admin = async (userId: string) => {
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/awards', async (req) => {
    requireUser(req);
    return awards.hall(db);
  });
  app.get('/me/awards', async (req) => awards.mine(db, requireUser(req)));
  app.post<Id>('/me/awards/:id/accept', async (req) => {
    const userId = requireUser(req);
    const input = awards.Accept.parse(req.body ?? {});
    return withTx(db, (tx) => awards.accept(tx, userId, req.params.id, input));
  });
  app.post<Id>('/me/awards/:id/decline', async (req) => awards.decline(db, requireUser(req), req.params.id));

  app.get('/admin/award-settings', async (req) => {
    await admin(requireUser(req));
    return { settings: await awards.settings(db) };
  });
  app.patch('/admin/award-settings', async (req) => {
    await admin(requireUser(req));
    return { settings: await awards.updateSettings(db, awards.SettingsPatch.parse(req.body)) };
  });
  app.get<{ Params: { year: string } }>('/admin/awards/:year', async (req) => {
    await admin(requireUser(req));
    const { year } = Year.parse(req.params);
    return { year, awards: await awards.forYear(db, year), standings: await awards.yearStandings(db, year, 20) };
  });
  app.post<{ Params: { year: string } }>('/admin/awards/:year/select', async (req) => {
    await admin(requireUser(req));
    const { year } = Year.parse(req.params);
    return { year, awards: await withTx(db, (tx) => awards.select(tx, year)) };
  });
}
