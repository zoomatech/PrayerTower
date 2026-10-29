// Encouragement partners (docs/GROWTH_PRACTICES.md): opt-in pairs for partner_days
// (30) who check in on each other: "good", "okay" or "hard", with an optional note.
// Off until Admin → Growth practices turns it on. Research: mutual peer support helps
// both sides (the helper benefit, research/Personal_Growth_Research.md).
//   - Only members who join are paired, inside one community, never across a block,
//     and never the same two people twice.
//   - Either one leaves with one tap: no reason, and the other sees only that it ended.
//   - It ends on its own; nothing counts check-ins or asks why one was missed.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import { settings } from '../practices/index.js';

const open = 'p.ended_at is null and p.ends_at > now()';

async function requirePartners(q: Queryable) {
  const s = await settings(q);
  if (!s.partners_enabled) throw badRequest('Encouragement partners are switched off');
  return s;
}

/** The member's side: waiting, paired (with recent check-ins), or neither. */
export async function partner(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.partners_enabled) return { enabled: false as const };
  const { rows } = await q.query<{ id: string; other_id: string; other_name: string; ends_at: Date; checked_today: boolean }>(
    `select p.id, o.id as other_id, o.display_name as other_name, p.ends_at,
            exists (select 1 from public.partner_checkins c where c.partnership_id = p.id and c.from_id = $1 and c.created_at > now() - interval '20 hours') as checked_today
       from public.partnerships p
       join public.profiles o on o.id = case when p.a_id = $1 then p.b_id else p.a_id end
      where (p.a_id = $1 or p.b_id = $1) and ${open}
      limit 1`,
    [userId],
  );
  const p = rows[0];
  if (!p) {
    const waiting = (await q.query('select 1 from public.partner_pool where user_id = $1', [userId])).rowCount! > 0;
    return { enabled: true as const, days: s.partner_days, status: waiting ? ('waiting' as const) : ('none' as const), partner: null, endsAt: null, canCheckIn: false, checkins: [] };
  }
  const { rows: checkins } = await q.query<{ id: string; mine: boolean; mood: string; note: string | null; created_at: Date }>(
    `select id, from_id = $2 as mine, mood, note, created_at from public.partner_checkins
      where partnership_id = $1 order by created_at desc limit 10`,
    [p.id, userId],
  );
  return {
    enabled: true as const,
    days: s.partner_days,
    status: 'paired' as const,
    partner: { id: p.other_id, displayName: p.other_name },
    endsAt: p.ends_at.toISOString(),
    canCheckIn: !p.checked_today,
    checkins: checkins.map((c) => ({ id: c.id, mine: c.mine, mood: c.mood, note: c.note, at: c.created_at.toISOString() })),
  };
}

export const Join = z.object({ agree: z.literal(true) });

/** Join: paired at once with whoever has waited longest in the same community, or wait. */
export async function join(q: Queryable, userId: string) {
  const s = await requirePartners(q);
  const now = await partner(q, userId);
  if (now.enabled && now.status !== 'none') return now;
  const { rows } = await q.query<{ user_id: string }>(
    `select w.user_id from public.partner_pool w
      where w.user_id <> $1
        and public.member_community_id(w.user_id) = public.member_community_id($1)
        and not exists (select 1 from public.user_blocks b where (b.user_id = w.user_id and b.blocked_id = $1) or (b.user_id = $1 and b.blocked_id = w.user_id))
        and not exists (select 1 from public.partnerships p where (p.a_id = w.user_id and p.b_id = $1) or (p.a_id = $1 and p.b_id = w.user_id))
      order by w.joined_at limit 1 for update skip locked`,
    [userId],
  );
  if (!rows[0]) {
    await q.query('insert into public.partner_pool (user_id) values ($1) on conflict do nothing', [userId]);
    return partner(q, userId);
  }
  const other = rows[0].user_id;
  await q.query('delete from public.partner_pool where user_id = any($1)', [[userId, other]]);
  await q.query('insert into public.partnerships (a_id, b_id, ends_at) values ($1, $2, now() + make_interval(days => $3))', [other, userId, s.partner_days]);
  const who = (await getProfile(q, userId))?.display_name || 'Someone';
  await notifications.notify(q, other, {
    kind: 'partner',
    title: 'You have an encouragement partner',
    body: `You and ${who} are partners for the next ${s.partner_days} days. Check in on each other when you can.`,
    data: { screen: 'partner' },
  });
  return partner(q, userId);
}

/** Leave the waiting list or the partnership. No reason is asked, and the partner isn't notified. */
export async function leave(q: Queryable, userId: string) {
  await requirePartners(q);
  await q.query('delete from public.partner_pool where user_id = $1', [userId]);
  await q.query(`update public.partnerships p set ended_at = now() where (p.a_id = $1 or p.b_id = $1) and p.ended_at is null`, [userId]);
  return partner(q, userId);
}

export const CheckIn = z.object({ mood: z.enum(['good', 'okay', 'hard']), note: z.string().trim().max(280).optional() });

const MOOD = { good: 'is doing well', okay: 'is doing okay', hard: 'is having a hard day' } as const;

/** One check-in a day. The partner hears it; a "hard" day invites a kind word back. */
export async function checkIn(q: Queryable, userId: string, input: z.infer<typeof CheckIn>) {
  await requirePartners(q);
  const now = await partner(q, userId);
  if (!now.enabled || now.status !== 'paired' || !now.partner) throw badRequest('You have no partner right now');
  if (!now.canCheckIn) throw badRequest('You already checked in today');
  const { rows } = await q.query<{ id: string }>('select id from public.partnerships p where (p.a_id = $1 or p.b_id = $1) and ' + open, [userId]);
  await q.query('insert into public.partner_checkins (partnership_id, from_id, mood, note) values ($1, $2, $3, $4)', [rows[0]!.id, userId, input.mood, input.note || null]);
  const who = (await getProfile(q, userId))?.display_name || 'Your partner';
  await notifications.notify(q, now.partner.id, {
    kind: 'partner',
    title: `${who} checked in`,
    body: `${who} ${MOOD[input.mood]}.${input.note ? ` "${input.note.slice(0, 120)}"` : ''}${input.mood === 'hard' ? ' A kind word would mean a lot.' : ''}`,
    data: { screen: 'partner' },
  });
  return partner(q, userId);
}
