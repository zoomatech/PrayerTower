// Church partners: a pastor applies for their church, an admin checks it and
// verifies it, and the applicant gets the 'pastor' role and a badge on their
// named posts. Declining sends the admin's note; revoking removes the role.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { grantRole, revokeRole } from '../accounts/index.js';
import * as communities from '../communities/index.js';
import * as notifications from '../notifications/index.js';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => s || null);

export const Application = z.object({
  name: z.string().trim().min(2).max(120),
  denomination: optional(80),
  pastorTitle: z.string().trim().min(1).max(60).default('Pastor'),
  city: z.string().trim().min(1).max(80),
  region: optional(80),
  country: z.string().trim().min(2).max(60),
  website: optional(200).refine((s) => !s || /^https?:\/\/\S+\.\S+$/.test(s), 'Website must start with http:// or https://'),
  phone: optional(40),
  about: optional(1000),
});

export const STATUSES = ['pending', 'verified', 'declined'] as const;
export type ChurchStatus = (typeof STATUSES)[number];
export const Decision = z.object({
  decision: z.enum(['verify', 'decline', 'revoke']),
  note: z.string().trim().max(500).optional(),
});

interface ChurchRow {
  id: string;
  applicant_id: string;
  name: string;
  denomination: string | null;
  pastor_title: string;
  city: string;
  region: string | null;
  country: string;
  website: string | null;
  phone: string | null;
  about: string | null;
  status: ChurchStatus;
  review_note: string | null;
  reviewed_at: Date | null;
  created_at: Date;
}

function present(r: ChurchRow) {
  return {
    id: r.id,
    name: r.name,
    denomination: r.denomination,
    pastorTitle: r.pastor_title,
    city: r.city,
    region: r.region,
    country: r.country,
    website: r.website,
    phone: r.phone,
    about: r.about,
    status: r.status,
    reviewNote: r.review_note,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  };
}

/** The member's latest application, if any. */
export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query<ChurchRow>('select * from public.churches where applicant_id = $1 order by id desc limit 1', [userId]);
  return rows[0] ? present(rows[0]) : null;
}

export async function apply(q: Queryable, userId: string, input: z.infer<typeof Application>) {
  // Church partners are for faith communities, as reading plans are.
  if (await communities.isSecular(q, userId)) throw forbidden('This is not offered in this community');
  try {
    const { rows } = await q.query<ChurchRow>(
      `insert into public.churches (applicant_id, name, denomination, pastor_title, city, region, country, website, phone, about)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning *`,
      [userId, input.name, input.denomination, input.pastorTitle, input.city, input.region, input.country, input.website, input.phone, input.about],
    );
    return present(rows[0]!);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('You already have a church application');
    throw err;
  }
}

/** The applicant changes a pending application. */
export async function edit(q: Queryable, userId: string, input: z.infer<typeof Application>) {
  const { rows } = await q.query<ChurchRow>(
    `update public.churches set name = $2, denomination = $3, pastor_title = $4, city = $5, region = $6, country = $7,
            website = $8, phone = $9, about = $10, updated_at = now()
      where applicant_id = $1 and status = 'pending' returning *`,
    [userId, input.name, input.denomination, input.pastorTitle, input.city, input.region, input.country, input.website, input.phone, input.about],
  );
  if (!rows[0]) throw notFound('Pending application');
  return present(rows[0]);
}

/** The applicant withdraws a pending application. */
export async function withdraw(q: Queryable, userId: string) {
  const { rowCount } = await q.query(`delete from public.churches where applicant_id = $1 and status = 'pending'`, [userId]);
  if (!rowCount) throw notFound('Pending application');
}

/** Admin list: pending first by default; includes who applied. */
export async function list(q: Queryable, status: ChurchStatus = 'pending') {
  const { rows } = await q.query<ChurchRow & { display_name: string; handle: string | null; email: string | null }>(
    `select c.*, p.display_name, p.handle, u.email
       from public.churches c
       join public.profiles p on p.id = c.applicant_id
       left join auth.users u on u.id = c.applicant_id
      where c.status = $1 order by c.id ${status === 'pending' ? 'asc' : 'desc'} limit 200`,
    [status],
  );
  return rows.map((r) => ({
    ...present(r),
    applicant: { id: r.applicant_id, displayName: r.display_name || 'Member', handle: r.handle, email: r.email },
  }));
}

/** Verify, decline, or revoke. Run in a transaction (role changes and the notice go together). */
export async function decide(q: Queryable, adminId: string, churchId: string, input: z.infer<typeof Decision>) {
  const { rows } = await q.query<ChurchRow>('select * from public.churches where id = $1 for update', [churchId]);
  const church = rows[0];
  if (!church) throw notFound('Church');
  const from = { verify: ['pending'], decline: ['pending'], revoke: ['verified'] }[input.decision];
  if (!from.includes(church.status)) throw badRequest(`This church is ${church.status}`);
  if (input.decision !== 'verify' && !input.note) throw badRequest('Add a note for the pastor');
  const status: ChurchStatus = input.decision === 'verify' ? 'verified' : 'declined';
  await q.query(
    `update public.churches set status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now() where id = $1`,
    [churchId, status, input.note ?? null, adminId],
  );
  if (status === 'verified') {
    await grantRole(q, church.applicant_id, 'pastor', adminId);
    await notifications.notify(q, church.applicant_id, {
      kind: 'church_verified',
      title: `${church.name} is verified`,
      body: 'Your pastor badge now shows on the requests you post under your name. Thank you for shepherding with us.',
      data: { churchId },
      t: { key: 'church_verified', params: { church: church.name } },
    });
  } else {
    await revokeRole(q, church.applicant_id, 'pastor');
    await notifications.notify(q, church.applicant_id, {
      kind: 'church_declined',
      title: input.decision === 'revoke' ? `${church.name} is no longer verified` : `We couldn't verify ${church.name} yet`,
      body: input.note!,
      data: { churchId },
      t: { key: input.decision === 'revoke' ? 'church_revoked' : 'church_declined', params: { church: church.name, note: input.note } },
    });
  }
  return present((await q.query<ChurchRow>('select * from public.churches where id = $1', [churchId])).rows[0]!);
}

/** "Pastor · Grace Chapel" badges: each verified pastor's title and church, by member id. */
export async function badgesOf(q: Queryable, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { title: string; church: string }>();
  const { rows } = await q.query<{ applicant_id: string; pastor_title: string; name: string }>(
    `select c.applicant_id, c.pastor_title, c.name from public.churches c
      where c.status = 'verified' and c.applicant_id = any($1::uuid[])
        and exists (select 1 from public.user_roles r where r.user_id = c.applicant_id and r.role = 'pastor')`,
    [userIds],
  );
  return new Map(rows.map((r) => [r.applicant_id, { title: r.pastor_title, church: r.name }]));
}
