// Moderation dashboard tools (migration 20261029074000_moderation_tools.sql), one
// switch in Admin → Moderation tools, off: search waiting reports and past
// decisions, decide several reports at once, and filter the staff audit log.
// Someone who may be in danger is never part of a bulk decision, and a bulk
// decision never suspends anyone or takes tokens: those stay one at a time.
import { z } from 'zod';
import type { Db, Queryable } from '../../db.js';
import { withTx } from '../../db.js';
import { badRequest, forbidden } from '../../errors.js';
import { like } from '../audit/index.js';
import { decide, RULE_KEYS } from './index.js';

export interface ToolSettings {
  tools_enabled: boolean;
  bulk_max: number;
}

export async function settings(q: Queryable): Promise<ToolSettings> {
  const { rows } = await q.query<ToolSettings>('select tools_enabled, bulk_max from public.moderation_tool_settings');
  return rows[0] ?? { tools_enabled: false, bulk_max: 25 };
}

export const SettingsPatch = z.object({ enabled: z.boolean().optional(), bulkMax: z.number().int().min(2).max(100).optional() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.moderation_tool_settings set tools_enabled = coalesce($1, tools_enabled), bulk_max = coalesce($2, bulk_max)', [
    p.enabled ?? null,
    p.bulkMax ?? null,
  ]);
  return settings(q);
}

export async function features(q: Queryable) {
  return { moderationTools: (await settings(q)).tools_enabled };
}

export async function requireOn(q: Queryable) {
  if (!(await settings(q)).tools_enabled) throw forbidden('Moderation tools are off (Admin → Moderation tools)');
}

export const Search = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['pending', 'decided']).default('pending'),
  source: z.enum(['ai', 'report', 'crisis', 'harm']).optional(),
  target: z.enum(['post', 'comment', 'reaction', 'message', 'event', 'spoken_prayer']).optional(),
  /** Decided items: page back from this decision time. */
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Waiting reports or past decisions, matching words in the content, the reason, or the author's or decider's name. */
export async function search(q: Queryable, s: z.infer<typeof Search>) {
  const { rows } = await q.query(
    `select m.*, a.display_name as author_name, d.display_name as decided_by_name,
            coalesce(po.body, c.body, r.note, x.body, ev.title || E'\\n' || ev.description, '[Spoken prayer, ' || sp.duration_seconds || ' seconds of audio]') as content
       from public.moderation_items m
       left join public.profiles a on a.id = m.user_id
       left join public.profiles d on d.id = m.decided_by
       left join public.posts po on m.target_type = 'post' and po.id = m.target_id
       left join public.comments c on m.target_type = 'comment' and c.id = m.target_id
       left join public.reactions r on m.target_type = 'reaction' and r.id = m.target_id
       left join public.messages x on m.target_type = 'message' and x.id = m.target_id
       left join public.events ev on m.target_type = 'event' and ev.id = m.target_id
       left join public.spoken_prayers sp on m.target_type = 'spoken_prayer' and sp.id = m.target_id
      where (case when $1 = 'pending' then m.status = 'pending' else m.status <> 'pending' end)
        and ($2::text is null or m.source::text = $2)
        and ($3::text is null or m.target_type::text = $3)
        and ($4::text is null or concat_ws(' ', po.body, c.body, r.note, x.body, ev.title, ev.description, m.reason, a.display_name, d.display_name) ilike $4)
        and ($5::timestamptz is null or m.decided_at < $5)
      order by case when $1 = 'pending' then (m.source = 'crisis') end desc,
               case when $1 = 'pending' then m.auto_hidden end desc,
               case when $1 = 'pending' then m.id end,
               m.decided_at desc nulls last, m.id desc
      limit $6`,
    [s.status, s.source ?? null, s.target ?? null, s.q ? like(s.q) : null, s.before ?? null, s.limit],
  );
  return rows;
}

export const Bulk = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  action: z.enum(['dismiss', 'remove']),
  rule: z.enum(RULE_KEYS).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** One decision for several waiting items, each in its own transaction; any that can't be decided are listed with why. */
export async function bulk(db: Db, moderatorId: string, input: z.infer<typeof Bulk>) {
  const s = await settings(db);
  if (!s.tools_enabled) throw forbidden('Moderation tools are off (Admin → Moderation tools)');
  const ids = [...new Set(input.ids)];
  if (ids.length > s.bulk_max) throw badRequest(`At most ${s.bulk_max} items at once (Admin → Moderation tools)`);
  const decided: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    try {
      await withTx(db, async (tx) => {
        const { rows } = await tx.query<{ source: string }>('select source from public.moderation_items where id = $1', [id]);
        if (rows[0]?.source === 'crisis') throw badRequest('Someone may be in danger: decide this one on its own');
        await decide(tx, moderatorId, id, {
          action: input.action,
          rule: input.action === 'remove' ? input.rule : undefined,
          note: input.note || `Bulk decision (${ids.length} selected)`,
          clawbackTransferIds: [],
        });
      });
      decided.push(id);
    } catch (err) {
      skipped.push({ id, reason: (err as Error).message });
    }
  }
  return { decided, skipped };
}
