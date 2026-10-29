import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as activity from '../activity/index.js';
import * as harm from '../harm/index.js';
import * as care from '../moderator-care/index.js';
import * as kindness from '../kindness/index.js';
import * as moderation from './index.js';
import * as tools from './tools.js';

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
    const moderatorId = await requireModerator(req);
    const { targetId } = z.object({ targetId: z.uuid().optional() }).parse(req.query);
    return { items: await moderation.pending(db, 100, targetId, (await care.settings(db)).enabled ? moderatorId : undefined) };
  });

  // Moderation tools (Admin → Moderation tools, off): search waiting reports and past decisions.
  app.get('/moderation/search', async (req) => {
    await requireModerator(req);
    await tools.requireOn(db);
    return { items: await tools.search(db, tools.Search.parse(req.query)) };
  });

  // Moderation tools: one decision for several waiting reports (never someone who may be in danger).
  app.post('/moderation/items/bulk', async (req) => {
    const moderatorId = await requireModerator(req);
    return tools.bulk(db, moderatorId, tools.Bulk.parse(req.body));
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
  // With the kind cloud on, the answer also carries `cloud`: the word rules' verdict
  // (modules/kindness), raised to a nudge when the AI would flag the text.
  app.post('/moderation/precheck', async (req) => {
    const userId = requireUser(req);
    const { text, context } = z.object({ text: z.string().max(10_000), context: z.enum(['lament', 'lamentReply']).optional() }).parse(req.body);
    // The harmful-prayer check (free, no AI): a gentle word and any hotlines, only when it applies (docs/HARMFUL_PRAYERS.md).
    const harmWord = await harm.precheck(db, text, userId).catch(() => null);
    const harmPart = harmWord ? { harm: harmWord } : {};
    const kind = await kindness.enabled(db);
    const rules = kind && text.trim() ? kindness.assessIn(text, context) : null;
    let warn = false;
    if (classify && text.trim()) {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
      const result = await Promise.race([classify(text).catch(() => null), timeout]);
      const flagged = result?.flagged ? Object.entries(result.categories).filter(([, v]) => v).map(([k]) => k) : [];
      // Self-harm is met with support, not a warning.
      warn = flagged.some((c) => !c.startsWith('self-harm'));
    }
    if (!rules) return { warn, ...harmPart };
    const cloud: kindness.Verdict = rules.level === 'ok' && warn ? { level: 'nudge', reason: 'aimed' } : rules;
    return { warn, cloud, ...harmPart };
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
