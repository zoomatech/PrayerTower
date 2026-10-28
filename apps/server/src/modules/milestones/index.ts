// Milestones module: bonus tokens for reaching milestones. Steve has not set
// the milestones yet, so rules are admin settings and the seeded ones are
// disabled placeholders. A worker cron awards anyone who has reached an
// enabled rule, once per member per rule.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as tokens from '../tokens/index.js';

export const METRICS = ['prayers_for_others', 'commitment_checkins', 'answered_requests'] as const;
export type Metric = (typeof METRICS)[number];

/** Per-member count for each metric. */
const METRIC_SQL: Record<Metric, string> = {
  prayers_for_others: `select e.user_id, count(*)::int as n from public.prayer_events e join public.posts p on p.id = e.post_id
                        where p.user_id <> e.user_id group by e.user_id`,
  commitment_checkins: `select user_id, count(*)::int as n from public.prayer_events where kind = 'commitment_checkin' group by user_id`,
  answered_requests: `select user_id, count(*)::int as n from public.posts where state = 'answered' group by user_id`,
};

export interface Rule {
  id: string;
  label: string;
  metric: Metric;
  threshold: number;
  amount: number;
  currency: tokens.Currency;
  enabled: boolean;
}

const COLS = 'id, label, metric, threshold, amount, currency, enabled';

export const RuleInput = z.object({
  label: z.string().trim().min(1).max(80),
  metric: z.enum(METRICS),
  threshold: z.number().int().min(1).max(1_000_000),
  amount: z.number().int().min(1).max(100_000),
  currency: z.enum(['regular', 'priestly']).default('regular'),
  enabled: z.boolean().default(false),
});

export async function rules(q: Queryable): Promise<(Rule & { awarded: number })[]> {
  const { rows } = await q.query(
    `select ${COLS}, (select count(*)::int from public.milestone_awards a where a.rule_id = r.id) as awarded
       from public.milestone_rules r order by metric, threshold`,
  );
  return rows;
}

export async function createRule(q: Queryable, input: z.infer<typeof RuleInput>): Promise<Rule> {
  const { rows } = await q.query<Rule>(
    `insert into public.milestone_rules (label, metric, threshold, amount, currency, enabled) values ($1, $2, $3, $4, $5, $6) returning ${COLS}`,
    [input.label, input.metric, input.threshold, input.amount, input.currency, input.enabled],
  );
  return rows[0]!;
}

export async function updateRule(q: Queryable, id: string, patch: Partial<z.infer<typeof RuleInput>>): Promise<Rule> {
  const { rows } = await q.query<Rule>(
    `update public.milestone_rules set label = coalesce($2, label), threshold = coalesce($3, threshold), amount = coalesce($4, amount),
            enabled = coalesce($5, enabled) where id = $1 returning ${COLS}`,
    [id, patch.label ?? null, patch.threshold ?? null, patch.amount ?? null, patch.enabled ?? null],
  );
  if (!rows[0]) throw notFound('Milestone rule');
  return rows[0];
}

/** Award every member who has reached an enabled rule and not been awarded it. Returns awards made. */
export async function awardDue(q: Queryable, limit = 1000): Promise<number> {
  const { rows: enabled } = await q.query<Rule>(`select ${COLS} from public.milestone_rules where enabled`);
  let made = 0;
  for (const rule of enabled) {
    const { rows: due } = await q.query<{ user_id: string }>(
      `select m.user_id from (${METRIC_SQL[rule.metric]}) m
        where m.n >= $1 and not exists (select 1 from public.milestone_awards a where a.rule_id = $2 and a.user_id = m.user_id)
        limit $3`,
      [rule.threshold, rule.id, limit],
    );
    for (const { user_id } of due) {
      const t = await tokens.awardBonus(q, user_id, rule.id, rule.amount, rule.currency);
      await q.query('insert into public.milestone_awards (rule_id, user_id, transfer_id) values ($1, $2, $3) on conflict do nothing', [rule.id, user_id, t.id]);
      const label = rule.label.replace(/\s*\(placeholder\)$/, '');
      await notifications.notify(q, user_id, {
        kind: 'milestone',
        title: `Milestone: ${label}`,
        body: `You received ${rule.amount} bonus ${rule.currency === 'priestly' ? 'Priestly ' : ''}token${rule.amount === 1 ? '' : 's'}. Thank you for praying.`,
        t: { key: 'milestone', params: { label, amount: rule.amount, priestly: rule.currency === 'priestly' } },
        data: { ruleId: rule.id },
        dedupeKey: `milestone:${rule.id}:${user_id}`,
      });
      made++;
    }
  }
  return made;
}

export function awardDueTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      await client.query('begin');
      try {
        await client.query(`select pg_advisory_xact_lock(hashtext('milestones_award_due'))`);
        await awardDue(client);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    });
  };
}
