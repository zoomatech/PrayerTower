// Reach module (roadmap Phase 2): Power Prayer spreads a request to live
// pray-ers who don't know the poster, limited free each week and then for
// tokens. Every number is an admin setting (reach_settings); the defaults are
// placeholders until Steve sets them.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as safety from '../safety/index.js';
import * as tokens from '../tokens/index.js';

export interface ReachSettings {
  power_prayer_reach: number;
  power_prayer_free_per_week: number;
  power_prayer_cost: number;
  power_prayer_max_per_recipient_day: number;
  power_prayer_active_days: number;
}

const COLUMNS: (keyof ReachSettings)[] = [
  'power_prayer_reach',
  'power_prayer_free_per_week',
  'power_prayer_cost',
  'power_prayer_max_per_recipient_day',
  'power_prayer_active_days',
];

export async function settings(q: Queryable): Promise<ReachSettings> {
  const { rows } = await q.query<ReachSettings>(`select ${COLUMNS.join(', ')} from public.reach_settings`);
  return rows[0]!;
}

export const SettingsPatch = z.object({
  powerPrayerReach: z.number().int().min(1).max(1000).optional(),
  powerPrayerFreePerWeek: z.number().int().min(0).max(100).optional(),
  powerPrayerCost: z.number().int().min(1).max(10_000).optional(),
  powerPrayerMaxPerRecipientDay: z.number().int().min(1).max(100).optional(),
  powerPrayerActiveDays: z.number().int().min(1).max(365).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<ReachSettings> {
  const values = [p.powerPrayerReach, p.powerPrayerFreePerWeek, p.powerPrayerCost, p.powerPrayerMaxPerRecipientDay, p.powerPrayerActiveDays];
  const sets = COLUMNS.map((c, i) => `${c} = coalesce($${i + 1}, ${c})`).join(', ');
  const { rows } = await q.query<ReachSettings>(`update public.reach_settings set ${sets} returning ${COLUMNS.join(', ')}`, values.map((v) => v ?? null));
  return rows[0]!;
}

async function freeUsedThisWeek(q: Queryable, userId: string) {
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.power_prayers where user_id = $1 and cost = 0 and created_at > now() - interval '7 days'`,
    [userId],
  );
  return rows[0]!.n;
}

/** What the member's next Power Prayer costs and how far it reaches. */
export async function status(q: Queryable, userId: string) {
  const s = await settings(q);
  const freeLeft = Math.max(0, s.power_prayer_free_per_week - (await freeUsedThisWeek(q, userId)));
  return {
    reach: s.power_prayer_reach,
    freeLeft,
    cost: freeLeft > 0 ? 0 : s.power_prayer_cost,
    blockedReason: await safety.askBlockedReason(q, userId),
  };
}

export interface PowerPrayer {
  id: string;
  post_id: string;
  cost: number;
  reached: number;
  created_at: Date;
}

/**
 * Ask up to `power_prayer_reach` live pray-ers to pray for a request. They
 * aren't connected to the poster, haven't prayed for it yet, haven't been
 * asked about it, aren't over their daily limit, and (for sensitive requests)
 * haven't opted out of trauma content. The sender stays unnamed.
 */
export async function powerPrayer(q: Queryable, userId: string, postId: string, key: string): Promise<PowerPrayer> {
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  posts.requirePrayable(post);
  const existing = await q.query<PowerPrayer>(
    'select id, post_id, cost, reached, created_at from public.power_prayers where user_id = $1 and idempotency_key = $2',
    [userId, key],
  );
  if (existing.rows[0]) return existing.rows[0];
  if (await moderation.awaitingCrisisReview(q, post.id)) {
    throw conflict('This request is waiting for a moderator to check in with the person who posted it. It can be amplified after that.');
  }
  await safety.checkNewMember(q, userId, 'ask');

  const s = await settings(q);
  const free = (await freeUsedThisWeek(q, userId)) < s.power_prayer_free_per_week;
  const cost = free ? 0 : s.power_prayer_cost;
  const t = cost > 0 ? await tokens.spendOnReach(q, userId, post.id, cost, `power:${key}`) : null;
  const { rows } = await q.query<PowerPrayer>(
    `insert into public.power_prayers (post_id, user_id, cost, transfer_id, idempotency_key) values ($1, $2, $3, $4, $5)
     returning id, post_id, cost, reached, created_at`,
    [post.id, userId, cost, t?.id ?? null, key],
  );
  const pp = rows[0]!;

  const { rows: recipients } = await q.query<{ id: string }>(
    `select p.id from public.profiles p
      where p.id not in ($1, $2)
        and p.onboarded_at is not null
        and (p.suspended_until is null or p.suspended_until < now())
        and (not $3 or not p.trauma_content_opt_out)
        and exists (select 1 from public.prayer_events e where e.user_id = p.id and e.created_at > now() - make_interval(days => $4))
        and not exists (select 1 from public.follows f where (f.user_id = p.id and f.followee_id = $1) or (f.user_id = $1 and f.followee_id = p.id))
        and not exists (select 1 from public.prayer_events e where e.user_id = p.id and e.post_id = $5)
        and not exists (select 1 from public.power_prayer_recipients r where r.post_id = $5 and r.user_id = p.id)
        and (select count(*) from public.power_prayer_recipients r where r.user_id = p.id and r.created_at > now() - interval '1 day') < $6
      order by random()
      limit $7`,
    [post.user_id, userId, post.is_sensitive, s.power_prayer_active_days, post.id, s.power_prayer_max_per_recipient_day, s.power_prayer_reach],
  );
  for (const r of recipients) {
    await q.query('insert into public.power_prayer_recipients (power_prayer_id, post_id, user_id) values ($1, $2, $3)', [pp.id, post.id, r.id]);
    await notifications.notify(q, r.id, {
      kind: 'power_prayer',
      title: 'Will you pray for this request?',
      body: post.body.length > 120 ? `${post.body.slice(0, 117)}...` : post.body,
      t: { key: 'power_prayer', params: { body: post.body.length > 120 ? `${post.body.slice(0, 117)}...` : post.body } },
      data: { postId: post.id },
    });
  }
  await q.query('update public.power_prayers set reached = $2 where id = $1', [pp.id, recipients.length]);
  return { ...pp, reached: recipients.length };
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*)::int as power_prayers, coalesce(sum(reached), 0)::int as people_asked, coalesce(sum(cost), 0)::int as tokens_spent
       from public.power_prayers where created_at >= $1`,
    [since],
  );
  return rows[0];
}
