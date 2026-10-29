// Goldfish memory (docs/GENTLE_REPAIR.md), one switch in Admin → Moderation tools, off. The
// moderation queue shows each author's recent removals so a moderator can tell a first slip from a
// pattern. Removals fade from the count after `goldfish_days` ("be a goldfish"); serious harms
// never fade. When an author reaches `goldfish_repeat` removals inside the window, the admins get
// a quiet in-app note. A person still decides everything: nothing here suspends anyone.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as notifications from '../notifications/index.js';

/** Rules whose removals never fade (Conflict_Repair_and_Newcomer_Kindness.md: "serious harms are kept out of the forgetting"). */
export const SERIOUS = ['harm', 'flooding', 'automation'] as const;

export interface Settings {
  goldfish_enabled: boolean;
  goldfish_days: number;
  goldfish_repeat: number;
}

export async function settings(q: Queryable): Promise<Settings> {
  const { rows } = await q.query<Settings>('select goldfish_enabled, goldfish_days, goldfish_repeat from public.moderation_tool_settings');
  return rows[0] ?? { goldfish_enabled: false, goldfish_days: 90, goldfish_repeat: 3 };
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  days: z.number().int().min(14).max(365).optional(),
  repeat: z.number().int().min(2).max(10).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.moderation_tool_settings set goldfish_enabled = coalesce($1, goldfish_enabled),
       goldfish_days = coalesce($2, goldfish_days), goldfish_repeat = coalesce($3, goldfish_repeat)`,
    [p.enabled ?? null, p.days ?? null, p.repeat ?? null],
  );
  return settings(q);
}

export interface History {
  /** Removals inside the window, for rules that fade. */
  recent: number;
  /** Removals for serious harms, at any time. */
  serious: number;
  days: number;
  repeat: boolean;
}

/** Each author's removals: one per piece of content, not counting removals overturned on appeal. */
export async function historyFor(q: Queryable, userIds: string[], s?: Settings): Promise<Map<string, History>> {
  const out = new Map<string, History>();
  const set = s ?? (await settings(q));
  if (!set.goldfish_enabled || !userIds.length) return out;
  const { rows } = await q.query<{ user_id: string; recent: number; serious: number }>(
    `select m.user_id,
            count(distinct (m.target_type, m.target_id)) filter (where not coalesce(m.rule, 'other') = any($3::text[]) and m.decided_at > now() - make_interval(days => $2))::int as recent,
            count(distinct (m.target_type, m.target_id)) filter (where m.rule = any($3::text[]))::int as serious
       from public.moderation_items m
      where m.user_id = any($1::uuid[]) and m.status = 'actioned'
        and not exists (select 1 from public.moderation_appeals a where a.moderation_item_id = m.id and a.status = 'overturned')
      group by m.user_id`,
    [[...new Set(userIds)], set.goldfish_days, SERIOUS],
  );
  for (const id of new Set(userIds)) {
    const r = rows.find((x) => x.user_id === id);
    const recent = r?.recent ?? 0;
    out.set(id, { recent, serious: r?.serious ?? 0, days: set.goldfish_days, repeat: recent >= set.goldfish_repeat });
  }
  return out;
}

/** Adds `history` to queue items while the switch is on. */
export async function withHistory<T extends { user_id: string | null }>(q: Queryable, items: T[]): Promise<(T & { history?: History })[]> {
  const ids = items.map((i) => i.user_id).filter((x): x is string => !!x);
  const h = await historyFor(q, ids);
  if (!h.size) return items;
  return items.map((i) => (i.user_id && h.has(i.user_id) ? { ...i, history: h.get(i.user_id) } : i));
}

/** After a removal: if the author has now reached the repeat count, the admins get one quiet note per author per window. */
export async function afterDecision(q: Queryable, itemId: string) {
  const s = await settings(q);
  if (!s.goldfish_enabled) return;
  const { rows } = await q.query<{ user_id: string | null; status: string; rule: string | null }>('select user_id, status, rule from public.moderation_items where id = $1', [itemId]);
  const item = rows[0];
  if (!item?.user_id || item.status !== 'actioned') return;
  const h = (await historyFor(q, [item.user_id], s)).get(item.user_id);
  if (!h?.repeat) return;
  const { rows: admins } = await q.query<{ user_id: string }>("select user_id from public.user_roles where role = 'admin' and user_id <> $1", [item.user_id]);
  const window = Math.floor(Date.now() / (s.goldfish_days * 86_400_000));
  for (const a of admins) {
    await notifications.notify(q, a.user_id, {
      kind: 'moderation_repeat',
      title: 'A member keeps getting posts removed',
      body: `${h.recent} removals in the last ${s.goldfish_days} days. A kind word from an admin may help more than a suspension.`,
      data: { userId: item.user_id, itemId },
      dedupeKey: `moderation_repeat:${item.user_id}:${window}`,
      quiet: true,
    });
  }
}

export async function features(q: Queryable) {
  return { goldfishMemory: (await settings(q)).goldfish_enabled };
}
