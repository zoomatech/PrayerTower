import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as activity from '../activity/index.js';
import * as moderation from './index.js';

export function moderationRoutes(app: FastifyInstance, db: Db, classify: moderation.Classifier | null = null) {
  const requireModerator = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
    return userId;
  };

  app.post('/reports', async (req, reply) => {
    const item = await moderation.report(db, requireUser(req), moderation.Report.parse(req.body));
    reply.code(201);
    return { reportId: item.id };
  });

  app.get('/moderation/queue', async (req) => {
    await requireModerator(req);
    return { items: await moderation.pending(db) };
  });

  // Prayer taps that look automated: flags only, a moderator decides.
  app.get('/moderation/activity-flags', async (req) => {
    await requireModerator(req);
    return { flags: await activity.pending(db) };
  });

  app.post<{ Params: { id: string } }>('/moderation/activity-flags/:id', async (req) => {
    const moderatorId = await requireModerator(req);
    await activity.decide(db, moderatorId, req.params.id, activity.Decision.parse(req.body));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/moderation/items/:id/decision', async (req) => {
    const moderatorId = await requireModerator(req);
    const decision = moderation.Decision.parse(req.body);
    await withTx(db, (tx) => moderation.decide(tx, moderatorId, req.params.id, decision));
    return { ok: true };
  });

  // Warn before posting: if the AI would flag this text, the app shows the rules first (Instagram-style nudge).
  // Never blocks; any error or a missing classifier means no warning.
  app.post('/moderation/precheck', async (req) => {
    requireUser(req);
    const { text } = z.object({ text: z.string().max(10_000) }).parse(req.body);
    if (!classify || !text.trim()) return { warn: false };
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    const result = await Promise.race([classify(text).catch(() => null), timeout]);
    const flagged = result?.flagged ? Object.entries(result.categories).filter(([, v]) => v).map(([k]) => k) : [];
    // Self-harm is met with support, not a warning.
    return { warn: flagged.some((c) => !c.startsWith('self-harm')) };
  });

  // Members appeal a removal of their own content; suspended members can still do this.
  app.post<{ Params: { id: string } }>('/moderation/items/:id/appeal', async (req, reply) => {
    const input = moderation.NewAppeal.parse(req.body);
    const appeal = await moderation.appeal(db, requireUser(req), req.params.id, input);
    reply.code(201);
    return { appealId: appeal.id };
  });

  app.get('/moderation/appeals', async (req) => {
    await requireModerator(req);
    return { appeals: await moderation.pendingAppeals(db) };
  });

  app.post<{ Params: { id: string } }>('/moderation/appeals/:id/decision', async (req) => {
    const moderatorId = await requireModerator(req);
    const decision = moderation.AppealDecision.parse(req.body);
    await withTx(db, (tx) => moderation.decideAppeal(tx, moderatorId, req.params.id, decision));
    return { ok: true };
  });
}
