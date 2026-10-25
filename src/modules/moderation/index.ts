// Moderation module: AI flags and member reports go into one human review
// queue. AI never penalizes anyone; it can only auto-hide the most severe
// content until a moderator decides. Every decision is logged.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export type Target = 'post' | 'comment' | 'reaction';

/** Categories severe enough to hide content until a human reviews it. */
export const AUTO_HIDE_CATEGORIES = [
  'sexual/minors',
  'hate/threatening',
  'harassment/threatening',
  'violence/graphic',
  'self-harm/instructions',
  'illicit/violent',
];

export async function queueScan(q: Queryable, target: Target, id: string) {
  await enqueue(q, 'moderation_scan', { target, id }, { jobKey: `moderation_scan:${target}:${id}` });
}

interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

export type Classifier = (text: string) => Promise<ModerationResult | null>;

/** OpenAI omni-moderation-latest. Returns null when no API key is configured. */
export function openAiClassifier(config: Config, fetchImpl: typeof fetch = fetch): Classifier {
  return async (text) => {
    if (!config.OPENAI_API_KEY) return null;
    const res = await fetchImpl('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
    });
    if (!res.ok) throw new Error(`moderation API ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results: ModerationResult[] };
    return json.results[0] ?? null;
  };
}

export function scanTask(q: Queryable, classify: Classifier): Task {
  return async (payload) => {
    const { target, id } = payload as { target: Target; id: string };
    const subject = await posts.moderationSubject(q, target, id);
    if (!subject?.text) return;
    const result = await classify(subject.text);
    if (!result?.flagged) return;
    const flagged = Object.entries(result.categories).filter(([, v]) => v).map(([k]) => k);
    const autoHide = flagged.some((c) => AUTO_HIDE_CATEGORIES.includes(c));
    await q.query(
      `insert into public.moderation_items (target_type, target_id, user_id, source, ai_categories, auto_hidden)
       values ($1, $2, $3, 'ai', $4, $5)`,
      [target, id, subject.user_id, { flagged, scores: result.category_scores }, autoHide],
    );
    if (autoHide) await posts.setModerationStatus(q, target, id, 'hidden_pending_review');
  };
}

export const Report = z.object({
  targetType: z.enum(['post', 'comment', 'reaction']),
  targetId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export async function report(q: Queryable, reporterId: string, input: z.infer<typeof Report>) {
  const subject = await posts.moderationSubject(q, input.targetType, input.targetId);
  if (!subject) throw notFound('Content');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.moderation_items (target_type, target_id, user_id, source, reporter_id, reason)
     values ($1, $2, $3, 'report', $4, $5)
     on conflict (target_type, target_id, reporter_id) where source = 'report' do update set reason = excluded.reason
     returning id`,
    [input.targetType, input.targetId, subject.user_id, reporterId, input.reason],
  );
  return rows[0]!;
}

export async function pending(q: Queryable, limit = 50) {
  const { rows } = await q.query(
    `select m.*, coalesce(po.body, c.body, r.note) as content
       from public.moderation_items m
       left join public.posts po on m.target_type = 'post' and po.id = m.target_id
       left join public.comments c on m.target_type = 'comment' and c.id = m.target_id
       left join public.reactions r on m.target_type = 'reaction' and r.id = m.target_id
      where m.status = 'pending' order by m.id limit $1`,
    [limit],
  );
  return rows;
}

export const Decision = z.object({
  action: z.enum(['dismiss', 'remove']),
  forfeitTokens: z.union([z.number().int().positive(), z.literal('all')]).optional(),
  suspendDays: z.number().int().min(1).max(3650).optional(),
  clawbackTransferIds: z.array(z.uuid()).max(50).default([]),
  note: z.string().max(1000).optional(),
});

/** A moderator's decision on a queue item, with any penalties, all logged. */
export async function decide(q: Queryable, moderatorId: string, itemId: string, d: z.infer<typeof Decision>) {
  const { rows } = await q.query<{ id: string; target_type: Target; target_id: string; user_id: string; status: string }>(
    'select * from public.moderation_items where id = $1 for update',
    [itemId],
  );
  const item = rows[0];
  if (!item) throw notFound('Moderation item');
  if (item.status !== 'pending') throw conflict('This item was already decided');
  if (d.action === 'dismiss' && (d.forfeitTokens || d.suspendDays || d.clawbackTransferIds.length)) {
    throw badRequest('Penalties require removing the content');
  }

  const log = (action: string, extra: { transferId?: string; suspendedUntil?: Date } = {}) =>
    q.query(
      `insert into public.moderation_actions (moderation_item_id, user_id, moderator_id, action, token_transfer_id, suspended_until, note)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [item.id, item.user_id, moderatorId, action, extra.transferId ?? null, extra.suspendedUntil ?? null, d.note ?? null],
    );

  if (d.action === 'dismiss') {
    await posts.setModerationStatus(q, item.target_type, item.target_id, 'visible');
    await log('dismiss');
  } else {
    await posts.setModerationStatus(q, item.target_type, item.target_id, 'removed');
    await log('remove');
    if (d.forfeitTokens) {
      const t = await tokens.forfeit(q, item.user_id, d.forfeitTokens, moderatorId, `forfeit:${item.id}`, d.note ?? 'moderation');
      if (t) await log('forfeit_tokens', { transferId: t.id });
    }
    for (const transferId of d.clawbackTransferIds) {
      const t = await tokens.clawback(q, transferId, moderatorId, d.note ?? 'moderation');
      await log('clawback', { transferId: t.id });
    }
    if (d.suspendDays) {
      const until = new Date(Date.now() + d.suspendDays * 86_400_000);
      await q.query('update public.profiles set suspended_until = greatest(coalesce(suspended_until, now()), $2) where id = $1', [
        item.user_id,
        until,
      ]);
      await log('suspend', { suspendedUntil: until });
    }
  }
  await q.query(`update public.moderation_items set status = $2, decided_by = $3, decided_at = now() where id = $1`, [
    item.id,
    d.action === 'dismiss' ? 'dismissed' : 'actioned',
    moderatorId,
  ]);
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*)::int as items,
            count(*) filter (where source = 'ai')::int as ai_flags,
            count(*) filter (where source = 'report')::int as reports,
            count(*) filter (where auto_hidden)::int as auto_hidden,
            count(*) filter (where status = 'pending')::int as pending,
            count(*) filter (where status = 'actioned')::int as actioned
       from public.moderation_items where created_at >= $1`,
    [since],
  );
  return rows[0];
}
