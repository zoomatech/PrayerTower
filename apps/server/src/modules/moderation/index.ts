// Moderation module: AI flags and member reports go into one human review
// queue. AI never penalizes anyone; it can only auto-hide the most severe
// content until a moderator decides. Every decision is logged.
import type { Task } from 'graphile-worker';
import { crisisLine } from '@prayer-tower/shared';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import * as messages from '../messages/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export type Target = 'post' | 'comment' | 'reaction' | 'message' | 'event';

export const CRISIS_REASON = 'Someone may be in danger';

/** Rules a removal can cite; titles match the app's Community rules (labels in packages/shared). */
export const RULES = {
  harm: 'Pray for good, never for harm',
  flooding: 'No flooding for a side',
  ads: 'No ads',
  abuse: 'No harassment or abuse',
  safe_messaging: 'No details of suicide or self-harm methods',
  other: 'Community rules',
} as const;
export type Rule = keyof typeof RULES;
const RULE_KEYS = Object.keys(RULES) as [Rule, ...Rule[]];

const NOUN = { post: 'request', comment: 'comment', reaction: 'encouragement', message: 'message', event: 'event' } as const;

/**
 * A post or comment that mentions suicide or self-harm stays up, is marked so
 * readers see crisis support, and goes to a person for review (once).
 */
export async function flagCrisis(q: Queryable, target: 'post' | 'comment' | 'message', id: string) {
  const { rows } = await q.query<{ user_id: string; community_id: string }>(
    `update public.${{ post: 'posts', comment: 'comments', message: 'messages' }[target]} set crisis = true where id = $1 returning user_id, community_id`,
    [id],
  );
  if (!rows[0]) return;
  await q.query(
    `insert into public.moderation_items (target_type, target_id, user_id, community_id, source, reason)
     values ($1, $2, $3, $4, 'crisis', $5)
     on conflict (target_type, target_id) where source = 'crisis' do nothing`,
    [target, id, rows[0].user_id, rows[0].community_id, CRISIS_REASON],
  );
}

/** Crisis posts are not amplified (reach, radio) until a person has reviewed them. */
export async function awaitingCrisisReview(q: Queryable, postId: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `select 1 from public.moderation_items where target_type = 'post' and target_id = $1 and source = 'crisis' and status = 'pending'`,
    [postId],
  );
  return !!rowCount;
}

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
    if (target !== 'reaction' && target !== 'event' && flagged.some((c) => c.startsWith('self-harm'))) await flagCrisis(q, target, id);
    const autoHide = flagged.some((c) => AUTO_HIDE_CATEGORIES.includes(c));
    await q.query(
      `insert into public.moderation_items (target_type, target_id, user_id, community_id, source, ai_categories, auto_hidden)
       values ($1, $2, $3, $4, 'ai', $5, $6)`,
      [target, id, subject.user_id, subject.community_id, { flagged, scores: result.category_scores }, autoHide],
    );
    if (autoHide) await posts.setModerationStatus(q, target, id, 'hidden_pending_review');
  };
}

export const Report = z.object({
  targetType: z.enum(['post', 'comment', 'reaction', 'message', 'event']),
  targetId: z.uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export async function report(q: Queryable, reporterId: string, input: z.infer<typeof Report>) {
  const subject = await posts.moderationSubject(q, input.targetType, input.targetId);
  if (!subject) throw notFound('Content');
  // Private messages can only be reported by someone in the conversation.
  if (input.targetType === 'message' && !(await messages.canSee(q, reporterId, input.targetId))) throw notFound('Content');
  // A group's event can only be reported by the group's members.
  if (input.targetType === 'event') {
    const { rowCount } = await q.query(
      `select 1 from public.events e where e.id = $1 and (e.conversation_id is null or exists (
         select 1 from public.conversation_members m where m.conversation_id = e.conversation_id and m.user_id = $2))`,
      [input.targetId, reporterId],
    );
    if (!rowCount) throw notFound('Content');
  }
  const { rows } = await q.query<{ id: string }>(
    `insert into public.moderation_items (target_type, target_id, user_id, community_id, source, reporter_id, reason)
     values ($1, $2, $3, $4, 'report', $5, $6)
     on conflict (target_type, target_id, reporter_id) where source = 'report' do update set reason = excluded.reason
     returning id`,
    [input.targetType, input.targetId, subject.user_id, subject.community_id, reporterId, input.reason],
  );
  return rows[0]!;
}

/** Someone who may be in danger comes first, then hidden content waiting on a person, then oldest first. Optionally only one target's items. */
export async function pending(q: Queryable, limit = 100, targetId?: string) {
  const { rows } = await q.query(
    `select m.*, coalesce(po.body, c.body, r.note, x.body, ev.title || E'\n' || ev.description) as content
       from public.moderation_items m
       left join public.posts po on m.target_type = 'post' and po.id = m.target_id
       left join public.comments c on m.target_type = 'comment' and c.id = m.target_id
       left join public.reactions r on m.target_type = 'reaction' and r.id = m.target_id
       left join public.messages x on m.target_type = 'message' and x.id = m.target_id
       left join public.events ev on m.target_type = 'event' and ev.id = m.target_id
      where m.status = 'pending' and ($2::uuid is null or m.target_id = $2)
      order by (m.source = 'crisis') desc, m.auto_hidden desc, m.id
      limit $1`,
    [limit, targetId ?? null],
  );
  return rows;
}

export const Decision = z.object({
  action: z.enum(['dismiss', 'remove']),
  forfeitTokens: z.union([z.number().int().positive(), z.literal('all')]).optional(),
  suspendDays: z.number().int().min(1).max(3650).optional(),
  clawbackTransferIds: z.array(z.uuid()).max(50).default([]),
  note: z.string().max(1000).optional(),
  /** The rule a removal applies. Defaults to the general community rules. */
  rule: z.enum(RULE_KEYS).optional(),
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

  const rule: Rule = d.rule ?? 'other';
  let suspendedUntil: Date | null = null;
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
      suspendedUntil = until;
    }
    await notifications.notify(q, item.user_id, removalNotice(item.target_type, rule, item.id, suspendedUntil));
  }
  await q.query(`update public.moderation_items set status = $2, decided_by = $3, decided_at = now(), rule = $4 where id = $1`, [
    item.id,
    d.action === 'dismiss' ? 'dismissed' : 'actioned',
    moderatorId,
    d.action === 'dismiss' ? null : rule,
  ]);
}

/** What the member is told: which rule, any suspension, and that they can appeal. Kind, never shaming. */
export function removalNotice(target: Target, rule: Rule, itemId: string, suspendedUntil: Date | null): notifications.NewNotification {
  const noun = NOUN[target];
  const body =
    rule === 'safe_messaging'
      ? `We removed your ${noun} because it described ways of self-harm, which can put others at risk. Your prayer matters, and you are welcome to post it again without those details. If you are struggling, ${crisisLine(process.env.CRISIS_COUNTRY).reach}.`
      : `We removed your ${noun} because it broke a community rule: ${RULES[rule]}.` +
        (suspendedUntil ? ` Your account can't post until ${suspendedUntil.toDateString()}.` : '') +
        ' If you think we got this wrong, you can appeal.';
  return { kind: 'moderation_notice', title: `Your ${noun} was removed`, body, data: { itemId, rule, appealable: true } };
}

// Appeals ------------------------------------------------------------------------

export const NewAppeal = z.object({ message: z.string().trim().min(1).max(1000) });

/** One appeal per removal, by the member it was applied to. */
export async function appeal(q: Queryable, userId: string, itemId: string, input: z.infer<typeof NewAppeal>) {
  const { rows } = await q.query<{ user_id: string; status: string }>('select user_id, status from public.moderation_items where id = $1', [itemId]);
  const item = rows[0];
  if (!item || item.user_id !== userId) throw notFound('Moderation decision');
  if (item.status !== 'actioned') throw badRequest('Only removals can be appealed');
  const res = await q.query<{ id: string }>(
    `insert into public.moderation_appeals (moderation_item_id, user_id, message) values ($1, $2, $3)
     on conflict (moderation_item_id) do nothing returning id`,
    [itemId, userId, input.message],
  );
  if (!res.rows[0]) throw conflict('You already appealed this decision');
  return res.rows[0];
}

export async function pendingAppeals(q: Queryable, limit = 50) {
  const { rows } = await q.query(
    `select a.id, a.moderation_item_id, m.target_type, m.rule, a.message, a.created_at,
            coalesce(po.body, c.body, r.note, msg.body, ev.title || E'\n' || ev.description) as content,
            (select max(suspended_until) from public.moderation_actions x where x.moderation_item_id = m.id) as suspended_until
       from public.moderation_appeals a
       join public.moderation_items m on m.id = a.moderation_item_id
       left join public.posts po on m.target_type = 'post' and po.id = m.target_id
       left join public.comments c on m.target_type = 'comment' and c.id = m.target_id
       left join public.reactions r on m.target_type = 'reaction' and r.id = m.target_id
       left join public.messages msg on m.target_type = 'message' and msg.id = m.target_id
       left join public.events ev on m.target_type = 'event' and ev.id = m.target_id
      where a.status = 'pending' order by a.id limit $1`,
    [limit],
  );
  return rows;
}

export const AppealDecision = z.object({ action: z.enum(['uphold', 'overturn']), note: z.string().trim().max(1000).optional() });

/** Overturning restores the content and lifts that decision's suspension; either way the member is told. */
export async function decideAppeal(q: Queryable, moderatorId: string, appealId: string, d: z.infer<typeof AppealDecision>) {
  const { rows } = await q.query<{ id: string; status: string; user_id: string; item_id: string; target_type: Target; target_id: string }>(
    `select a.id, a.status, a.user_id, m.id as item_id, m.target_type, m.target_id
       from public.moderation_appeals a join public.moderation_items m on m.id = a.moderation_item_id
      where a.id = $1 for update of a`,
    [appealId],
  );
  const a = rows[0];
  if (!a) throw notFound('Appeal');
  if (a.status !== 'pending') throw conflict('This appeal was already decided');
  await q.query(`update public.moderation_appeals set status = $2, decided_by = $3, decided_at = now(), decision_note = $4 where id = $1`, [
    a.id,
    d.action === 'overturn' ? 'overturned' : 'upheld',
    moderatorId,
    d.note ?? null,
  ]);
  const noun = NOUN[a.target_type];
  if (d.action === 'overturn') {
    await posts.setModerationStatus(q, a.target_type, a.target_id, 'visible');
    const { rows: s } = await q.query<{ until: Date | null }>(
      `select max(suspended_until) as until from public.moderation_actions where moderation_item_id = $1`,
      [a.item_id],
    );
    if (s[0]?.until) {
      await q.query('update public.profiles set suspended_until = null where id = $1 and suspended_until <= $2', [a.user_id, s[0].until]);
    }
    await q.query(
      `insert into public.moderation_actions (moderation_item_id, user_id, moderator_id, action, note) values ($1, $2, $3, 'restore', $4)`,
      [a.item_id, a.user_id, moderatorId, d.note ?? 'Appeal overturned'],
    );
  }
  await notifications.notify(q, a.user_id, {
    kind: 'appeal_decision',
    title: d.action === 'overturn' ? 'Your appeal was accepted' : 'Your appeal was reviewed',
    body:
      d.action === 'overturn'
        ? `A moderator looked again and restored your ${noun}. Thank you for your patience.`
        : `A moderator looked again and the decision stands.${d.note ? ` ${d.note}` : ''}`,
    data: { itemId: a.item_id },
  });
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
