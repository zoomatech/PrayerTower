import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as care from '../moderator-care/index.js';
import * as oncall from '../moderator-care/oncall.js';
import * as safetyDashboard from '../moderator-care/safety.js';
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

  // Moderator care: blur hard items, offer breaks, hand an item to someone else.
  app.get('/moderation/care', async (req) => {
    const moderatorId = await requireModerator(req);
    const settings = await care.settings(db);
    return { settings, colleagues: settings.enabled ? await care.colleagues(db, moderatorId) : [] };
  });

  app.patch('/admin/moderator-care-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await care.updateSettings(db, care.SettingsPatch.parse(req.body)) };
  });

  // Admin → Moderation dashboard and the weekly tuning reports (dashboard_enabled).
  app.get('/admin/moderation-dashboard', async (req) => {
    await requireAdmin(req);
    if (!(await care.settings(db)).dashboard_enabled) throw forbidden('The moderation dashboard is switched off (Admin → Moderator care)');
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(7) }).parse(req.query);
    return { dashboard: await care.dashboard(db, days), reports: await care.reports(db) };
  });

  // Admin → Safety dashboard (safety_dashboard_enabled): held posts, response times, on-call gaps, restores.
  app.get('/admin/safety-dashboard', async (req) => {
    await requireAdmin(req);
    if (!(await care.settings(db)).safety_dashboard_enabled) throw forbidden('The safety dashboard is switched off (Admin → Moderator care)');
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(7) }).parse(req.query);
    return { dashboard: await safetyDashboard.dashboard(db, days) };
  });

  app.post<{ Params: { id: string } }>('/moderation/items/:id/handoff', async (req) => {
    const moderatorId = await requireModerator(req);
    const input = care.Handoff.parse(req.body);
    await withTx(db, (tx) => care.handoff(tx, moderatorId, req.params.id, input));
    return { ok: true };
  });

  // The on-call rota (Admin → Moderator care → On-call rota). Moderators see who is on
  // call and leave notes for the next shift; admins set shifts and the waiting limit.
  app.get('/moderation/oncall', async (req) => {
    await requireModerator(req);
    const status = await oncall.status(db);
    if (!status.settings.enabled) return { status: { ...status, notes: [] } };
    return { status, shifts: await oncall.shifts(db) };
  });

  app.post('/moderation/oncall/notes', async (req) => {
    const moderatorId = await requireModerator(req);
    if (!(await oncall.settings(db)).enabled) throw forbidden('The on-call rota is switched off (Admin → Moderator care)');
    return oncall.addNote(db, moderatorId, oncall.Note.parse(req.body).body);
  });

  app.get('/admin/oncall', async (req) => {
    await requireAdmin(req);
    return { settings: await oncall.settings(db), shifts: await oncall.shifts(db), people: await oncall.people(db) };
  });

  app.patch('/admin/oncall', async (req) => {
    await requireAdmin(req);
    return { settings: await oncall.updateSettings(db, oncall.SettingsPatch.parse(req.body)) };
  });

  app.post('/admin/oncall/shifts', async (req) => {
    const adminId = await requireAdmin(req);
    return oncall.addShift(db, adminId, oncall.Shift.parse(req.body));
  });

  app.delete<{ Params: { id: string } }>('/admin/oncall/shifts/:id', async (req) => {
    await requireAdmin(req);
    await oncall.removeShift(db, z.uuid().parse(req.params.id));
    return { ok: true };
  });
}
