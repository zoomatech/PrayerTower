// Gifts to a prayer group or a meet-up (Business Plan 6.2). Off by default. The giver's
// tokens are split evenly among the recipients (a group's other active members, or the
// people going to an event), each share an ordinary gift in the ledger, so blocks are
// honored and a retry with the same key gives nothing twice. Any remainder that doesn't
// split evenly stays with the giver.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as events from '../events/index.js';
import * as tokens from '../tokens/index.js';

export const MAX_RECIPIENTS = 200;
export const Gift = z.object({ amount: z.number().int().min(1).max(100_000), idempotencyKey: z.string().min(8).max(100) });

async function enabled(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select group_gifts_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

/** Other current members, never across a block either way. */
const RECIPIENT_FILTER = `p.deleted_at is null and p.id <> $1
  and not exists (select 1 from public.user_blocks b where (b.user_id = $1 and b.blocked_id = p.id) or (b.user_id = p.id and b.blocked_id = $1))`;

async function groupRecipients(q: Queryable, userId: string, groupId: string) {
  const { rows: mine } = await q.query(
    `select 1 from public.conversations c join public.conversation_members m on m.conversation_id = c.id
      where c.id = $2 and c.kind = 'group' and c.closed_at is null and m.user_id = $1 and m.status = 'active'`,
    [userId, groupId],
  );
  if (!mine.length) throw notFound('Group');
  const { rows } = await q.query<{ id: string }>(
    `select p.id from public.conversation_members m join public.profiles p on p.id = m.user_id
      where m.conversation_id = $2 and m.status = 'active' and ${RECIPIENT_FILTER} order by p.id`,
    [userId, groupId],
  );
  return rows.map((r) => r.id);
}

async function eventRecipients(q: Queryable, userId: string, eventId: string) {
  const event = await events.get(q, userId, eventId);
  if (event.cancelled) throw badRequest('This event was cancelled');
  const { rows } = await q.query<{ id: string }>(
    `select p.id from public.event_rsvps r join public.profiles p on p.id = r.user_id
      where r.event_id = $2 and r.status = 'going' and ${RECIPIENT_FILTER} order by p.id`,
    [userId, eventId],
  );
  return rows.map((r) => r.id);
}

/** How many people a gift would be split among, so the app can say so before giving. */
export async function preview(q: Queryable, userId: string, target: 'group' | 'event', id: string) {
  if (!(await enabled(q))) return { enabled: false as const };
  const ids = target === 'group' ? await groupRecipients(q, userId, id) : await eventRecipients(q, userId, id);
  return { enabled: true as const, recipients: Math.min(ids.length, MAX_RECIPIENTS) };
}

export async function give(q: Queryable, userId: string, target: 'group' | 'event', id: string, input: z.infer<typeof Gift>) {
  if (!(await enabled(q))) throw forbidden('Gifts to groups and meet-ups are off');
  const ids = (target === 'group' ? await groupRecipients(q, userId, id) : await eventRecipients(q, userId, id)).slice(0, MAX_RECIPIENTS);
  if (!ids.length) throw badRequest('There is no one else here to give to yet');
  const each = Math.floor(input.amount / ids.length);
  if (each < 1) throw badRequest(`Give at least ${ids.length} tokens so everyone gets one`);
  for (const to of ids) await tokens.gift(q, userId, to, each, `${target}:${id}:${input.idempotencyKey}:${to}`);
  return { recipients: ids.length, each, given: each * ids.length, balance: await tokens.balanceOf(q, userId) };
}
