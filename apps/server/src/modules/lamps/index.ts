// Lamp awards (research/Contributing_Without_Ad_Money.md, suggestion 1). A member
// thanks someone in their community with a short note, like Wikipedia's barnstar,
// which made top editors 60% more productive in a randomized trial. Recognition
// only: a lamp carries no tokens and no price. Off by default (Admin → Notebook ideas).
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as safety from '../safety/index.js';

export const NewLamp = z.object({ note: z.string().trim().min(1).max(280) });

async function settings(q: Queryable) {
  const { rows } = await q.query<{ lamps_enabled: boolean; lamps_per_week: number }>('select lamps_enabled, lamps_per_week from public.notebook_settings');
  return rows[0]!;
}

async function sameCommunity(q: Queryable, a: string, b: string) {
  const { rows } = await q.query<{ same: boolean }>('select public.member_community_id($1) = public.member_community_id($2) as same', [a, b]);
  return rows[0]?.same === true;
}

async function visiblePerson(q: Queryable, viewerId: string, personId: string) {
  const { rows } = await q.query<{ display_name: string }>('select display_name from public.profiles where id = $1 and deleted_at is null', [personId]);
  if (!rows[0] || (await posts.blockedBetween(q, viewerId, personId))) throw notFound('Person');
  return rows[0];
}

/** Lamps a person has received: the count and the latest notes, for anyone in their community. */
export async function received(q: Queryable, viewerId: string, personId: string) {
  const s = await settings(q);
  if (!s.lamps_enabled) return { enabled: false, count: 0, lamps: [], canGive: false, leftThisWeek: 0 };
  await visiblePerson(q, viewerId, personId);
  if (viewerId !== personId && !(await sameCommunity(q, viewerId, personId))) throw notFound('Person');
  const { rows: count } = await q.query<{ n: number }>('select count(*)::int as n from public.lamp_awards where recipient_id = $1', [personId]);
  const { rows: lamps } = await q.query(
    `select l.id, l.note, l.created_at as "createdAt", g.id as "giverId", g.display_name as "giverName"
       from public.lamp_awards l join public.profiles g on g.id = l.giver_id
      where l.recipient_id = $1 and g.deleted_at is null
        and not exists (select 1 from public.user_blocks b where (b.user_id = $2 and b.blocked_id = l.giver_id) or (b.user_id = l.giver_id and b.blocked_id = $2))
      order by l.created_at desc limit 5`,
    [personId, viewerId],
  );
  const left = s.lamps_per_week - (await givenThisWeek(q, viewerId));
  return { enabled: true, count: count[0]!.n, lamps, canGive: viewerId !== personId, leftThisWeek: Math.max(0, left) };
}

async function givenThisWeek(q: Queryable, giverId: string) {
  const { rows } = await q.query<{ n: number }>(`select count(*)::int as n from public.lamp_awards where giver_id = $1 and created_at > now() - interval '7 days'`, [giverId]);
  return rows[0]!.n;
}

export async function give(q: Queryable, giverId: string, recipientId: string, input: z.infer<typeof NewLamp>) {
  const s = await settings(q);
  if (!s.lamps_enabled) throw forbidden('Lamps are not available');
  if (giverId === recipientId) throw badRequest("You can't give yourself a lamp");
  await visiblePerson(q, giverId, recipientId);
  if (!(await sameCommunity(q, giverId, recipientId))) throw notFound('Person');
  if (safety.hasLink(input.note)) throw badRequest('Lamp notes carry no links.');
  const blocked = await safety.newMemberBlock(q, giverId, 'give lamps');
  if (blocked) throw forbidden(blocked);
  // Serialize a giver's lamps so two at once can't pass the weekly cap.
  await q.query('select pg_advisory_xact_lock(hashtext($1))', [`lamp:${giverId}`]);
  if ((await givenThisWeek(q, giverId)) >= s.lamps_per_week) {
    throw new AppError(429, 'lamp_weekly_limit', `You can give ${s.lamps_per_week} lamps a week. They mean more that way.`);
  }
  const { rows: recent } = await q.query(
    `select 1 from public.lamp_awards where giver_id = $1 and recipient_id = $2 and created_at > now() - interval '7 days'`,
    [giverId, recipientId],
  );
  if (recent[0]) throw new AppError(409, 'lamp_already_given', 'You already gave this person a lamp this week.');
  const { rows } = await q.query<{ id: string }>('insert into public.lamp_awards (giver_id, recipient_id, note) values ($1, $2, $3) returning id', [giverId, recipientId, input.note]);
  const { rows: giver } = await q.query<{ display_name: string }>('select display_name from public.profiles where id = $1', [giverId]);
  await notifications.notify(q, recipientId, {
    kind: 'lamp',
    title: `${giver[0]!.display_name} gave you a lamp`,
    body: input.note,
    data: { personId: recipientId, lampId: rows[0]!.id },
  });
  return { id: rows[0]!.id };
}
