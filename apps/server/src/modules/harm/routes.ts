import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as harm from './index.js';

export function harmRoutes(app: FastifyInstance, db: Db) {
  const requireRole = (...roles: ('admin' | 'moderator')[]) => async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, ...roles))) throw forbidden(roles.includes('moderator') ? 'Moderators only' : 'Admins only');
    return userId;
  };
  const requireAdmin = requireRole('admin');
  const requireModerator = requireRole('moderator', 'admin');

  // Admin → Harmful prayers: the switch, what happens per category, swearing and flood limits.
  app.get('/admin/harm-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await harm.settings(db) };
  });

  app.patch('/admin/harm-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await harm.updateSettings(db, harm.SettingsPatch.parse(req.body)) };
  });

  // What the check flagged in the last N days, by category and action.
  app.get('/admin/harm-metrics', async (req) => {
    await requireAdmin(req);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    return { counts: await harm.metrics(db, new Date(Date.now() - days * 86_400_000)) };
  });

  // Floods: one account's many flagged items, decided together.
  app.get('/moderation/harm-floods', async (req) => {
    await requireModerator(req);
    return { floods: await harm.floods(db) };
  });

  app.post<{ Params: { userId: string } }>('/moderation/harm-floods/:userId', async (req) => {
    const moderatorId = await requireModerator(req);
    const { userId } = z.object({ userId: z.uuid() }).parse(req.params);
    if (userId === moderatorId) throw forbidden('Another moderator must decide about your own posts');
    const { action } = harm.FloodDecision.parse(req.body);
    return withTx(db, (tx) => harm.decideFlood(tx, moderatorId, userId, action));
  });
}
