// Tiers module: Prayer Scout → Prayerful Helper → Prayer Warrior, earned by
// praying, plus the weekly token resupply by tier. Thresholds and allotments
// are configurable in tier_settings and stay unset (null) until decided.
// Anonymous members are on a private track: their tier counts but is shown
// only to them.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { allMemberIds } from '../accounts/index.js';
import { prayerCounts } from '../prayer-actions/index.js';
import * as tokens from '../tokens/index.js';

export interface TierSetting {
  tier: string;
  rank: number;
  min_prayer_events: number | null;
  weekly_allotment: number | null;
  label: string;
}

export async function settings(q: Queryable): Promise<TierSetting[]> {
  const { rows } = await q.query<TierSetting>('select * from public.tier_settings order by rank');
  return rows;
}

export const SettingUpdate = z.object({
  minPrayerEvents: z.number().int().min(0).nullable().optional(),
  weeklyAllotment: z.number().int().min(0).max(10_000).nullable().optional(),
});

export async function updateSetting(q: Queryable, tier: string, input: z.infer<typeof SettingUpdate>) {
  const { rows } = await q.query<TierSetting>(
    `update public.tier_settings set
        min_prayer_events = case when $2 then $3::int else min_prayer_events end,
        weekly_allotment = case when $4 then $5::int else weekly_allotment end
      where tier = $1 returning *`,
    [tier, input.minPrayerEvents !== undefined, input.minPrayerEvents ?? null, input.weeklyAllotment !== undefined, input.weeklyAllotment ?? null],
  );
  if (!rows[0]) throw notFound('Tier');
  const all = await settings(q);
  const thresholds = all.map((s) => s.min_prayer_events);
  for (let i = 1; i < thresholds.length; i++) {
    const prev = thresholds.slice(0, i).filter((t) => t !== null).at(-1);
    if (thresholds[i] !== null && prev !== undefined && prev !== null && thresholds[i]! <= prev) {
      throw badRequest('Each tier must need more prayers than the one below it');
    }
  }
  return rows[0];
}

/** The highest tier whose threshold is met. The first tier needs nothing when its threshold is unset. */
export function tierFor(prayerEvents: number, all: TierSetting[]): TierSetting | null {
  let current: TierSetting | null = null;
  for (const s of [...all].sort((a, b) => a.rank - b.rank)) {
    const min = s.min_prayer_events ?? (s.rank === 1 ? 0 : null);
    if (min !== null && prayerEvents >= min) current = s;
  }
  return current;
}

export async function tiersOf(q: Queryable, userIds: string[]): Promise<Map<string, TierSetting | null>> {
  const [all, counts] = await Promise.all([settings(q), prayerCounts(q, userIds)]);
  return new Map(userIds.map((id) => [id, tierFor(counts.get(id) ?? 0, all)]));
}

export async function status(q: Queryable, userId: string) {
  const [all, counts] = await Promise.all([settings(q), prayerCounts(q, [userId])]);
  const prayers = counts.get(userId) ?? 0;
  const tier = tierFor(prayers, all);
  const next = all.find((s) => s.rank > (tier?.rank ?? 0) && s.min_prayer_events !== null) ?? null;
  return {
    tier: tier && { tier: tier.tier, label: tier.label, weeklyAllotment: tier.weekly_allotment },
    prayers,
    next: next && { tier: next.tier, label: next.label, prayersNeeded: Math.max(0, next.min_prayer_events! - prayers) },
  };
}

/** ISO week label, e.g. 2026-W43, used to make each week's resupply idempotent. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Weekly cron: credit each member their tier's allotment, once per ISO week. */
export function weeklyResupplyTask(q: Queryable): Task {
  return async (_payload, helpers) => {
    const week = isoWeek(new Date());
    const ids = await allMemberIds(q);
    const tiers = await tiersOf(q, ids);
    let credited = 0;
    for (const id of ids) {
      const amount = tiers.get(id)?.weekly_allotment ?? 0;
      if (amount <= 0) continue;
      await tokens.resupply(q, id, amount, `resupply:${id}:${week}`);
      credited++;
    }
    helpers.logger.info(`weekly resupply ${week}: credited ${credited} members`);
  };
}
