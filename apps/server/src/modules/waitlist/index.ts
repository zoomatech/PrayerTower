// The public waitlist (concept document Phase 1; Research Questions: keep the
// product quiet until launch). People leave an email on /waitlist (or
// /open-circle/waitlist); admins invite them from Admin → Waitlist, which makes
// a one-use invite code for the right edition. Off until notebook_settings.waitlist_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import * as invites from '../invites/index.js';

export const Join = z.object({
  email: z.email().max(320),
  name: z.string().trim().max(80).default(''),
  note: z.string().trim().max(300).default(''),
  edition: z.enum(['prayer-tower', 'open-circle']).default('prayer-tower'),
});

export async function enabled(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select waitlist_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

/** Adds the person once; a second sign-up with the same email changes nothing and is not an error (no account probing). */
export async function join(q: Queryable, input: z.infer<typeof Join>) {
  await q.query(
    `insert into public.waitlist_entries (email, name, note, edition) values ($1, $2, $3, $4)
     on conflict (lower(email)) do nothing`,
    [input.email.trim(), input.name, input.note, input.edition],
  );
}

export interface Entry {
  id: string;
  email: string;
  name: string;
  note: string;
  edition: 'prayer-tower' | 'open-circle';
  inviteCode: string | null;
  invitedAt: string | null;
  createdAt: string;
}

export async function list(q: Queryable, limit = 500): Promise<Entry[]> {
  const { rows } = await q.query(
    `select id, email, name, note, edition, invite_code, invited_at, created_at from public.waitlist_entries order by created_at limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id, email: r.email, name: r.name, note: r.note, edition: r.edition, inviteCode: r.invite_code,
    invitedAt: r.invited_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
  }));
}

/** Makes a one-use invite code for the entry's edition and records it. */
export async function invite(q: Queryable, staffId: string, id: string) {
  const { rows } = await q.query<{ email: string; edition: string; invite_code: string | null }>(
    'select email, edition, invite_code from public.waitlist_entries where id = $1 for update',
    [id],
  );
  const e = rows[0];
  if (!e) throw notFound('Waitlist entry');
  if (e.invite_code) throw conflict('Already invited');
  const [code] = await invites.create(q, staffId, {
    note: `Waitlist: ${e.email}`.slice(0, 200), maxUses: 1, expiresInDays: 30, count: 1,
    ...(e.edition === 'open-circle' ? { community: 'open-circle' } : {}),
  });
  await q.query('update public.waitlist_entries set invite_code = $2, invited_at = now() where id = $1', [id, code!.code]);
  return { email: e.email, invite: code! };
}

export async function remove(q: Queryable, id: string) {
  const { rowCount } = await q.query('delete from public.waitlist_entries where id = $1', [id]);
  if (!rowCount) throw notFound('Waitlist entry');
}
