// Looking after moderators (docs/HARMFUL_PRAYERS.md, "For moderators"), off by default:
// hard items blurred until tapped, a break offered after a stretch of reviewing, and
// an item handed to another moderator with a note so nobody decides a hard case alone.
// The break is an offer, never a lock: moderators choose (Steiger et al. 2021; arxiv.org/abs/2509.07187).
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';

export interface CareSettings {
  enabled: boolean;
  blur_hard: boolean;
  break_after_minutes: number;
  break_after_hard_items: number;
  break_minutes: number;
}
const COLUMNS = ['enabled', 'blur_hard', 'break_after_minutes', 'break_after_hard_items', 'break_minutes'] as const satisfies readonly (keyof CareSettings)[];

export async function settings(q: Queryable): Promise<CareSettings> {
  const { rows } = await q.query<CareSettings>(`select ${COLUMNS.join(', ')} from public.moderator_care_settings`);
  return rows[0]!;
}

export const SettingsPatch = z
  .object({
    enabled: z.boolean(),
    blur_hard: z.boolean(),
    break_after_minutes: z.number().int().min(0).max(600),
    break_after_hard_items: z.number().int().min(0).max(1000),
    break_minutes: z.number().int().min(1).max(120),
  })
  .partial();

export async function updateSettings(q: Queryable, patch: z.infer<typeof SettingsPatch>): Promise<CareSettings> {
  const sets = COLUMNS.map((c, i) => `${c} = coalesce($${i + 1}, ${c})`).join(', ');
  const { rows } = await q.query<CareSettings>(`update public.moderator_care_settings set ${sets}, updated_at = now() returning ${COLUMNS.join(', ')}`, [
    ...COLUMNS.map((c) => patch[c] ?? null),
  ]);
  return rows[0]!;
}

/** The other people who can take an item: moderators and admins, but not the asker. */
export async function colleagues(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; display_name: string }>(
    `select distinct p.id, p.display_name from public.user_roles r join public.profiles p on p.id = r.user_id
      where r.role in ('moderator', 'admin') and p.id <> $1 order by p.display_name limit 100`,
    [userId],
  );
  return rows;
}

export const Handoff = z.object({ toUserId: z.uuid().optional(), note: z.string().trim().max(500).optional() });

/**
 * Pass an item to a named moderator, or to "anyone else" (no name). It leaves the
 * passer's queue and goes to the top of the named moderator's. They hear about it,
 * without the content.
 */
export async function handoff(q: Queryable, moderatorId: string, itemId: string, input: z.infer<typeof Handoff>) {
  const s = await settings(q);
  if (!s.enabled) throw forbidden('Handing items to another moderator is switched off (Admin → Moderator care)');
  const { rows } = await q.query<{ status: string; user_id: string }>('select status, user_id from public.moderation_items where id = $1 for update', [itemId]);
  const item = rows[0];
  if (!item) throw notFound('Moderation item');
  if (item.status !== 'pending') throw conflict('This item was already decided');
  if (input.toUserId) {
    if (input.toUserId === moderatorId) throw badRequest('Pick someone else');
    if (input.toUserId === item.user_id) throw badRequest("A moderator can't decide about their own post");
    if (!(await colleagues(q, moderatorId)).some((c) => c.id === input.toUserId)) throw badRequest('That person is not a moderator');
  }
  await q.query(
    `update public.moderation_items set handoff_from = $2, handoff_to = $3, handoff_note = $4, handoff_at = now() where id = $1`,
    [itemId, moderatorId, input.toUserId ?? null, input.note || null],
  );
  if (input.toUserId) {
    await notifications.notify(q, input.toUserId, {
      kind: 'moderation_handoff',
      title: 'A moderator asked you to take an item',
      body: 'It is at the top of your moderation queue.',
      data: { itemId },
      dedupeKey: `moderation_handoff:${itemId}:${input.toUserId}`,
    });
  }
}
