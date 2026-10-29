// Sponsor recognition (Business Plan 11.4), behind sponsor_settings.sponsors_page_enabled
// (off). Staff record who sponsored what; the public page names them with a short
// thank-you. The ad ban covers sponsors: no logos, no links and no product names
// beyond the sponsor's own name, so a thank-you with a web address is refused.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';

export const KINDS = ['launch', 'fund', 'witness', 'pool', 'community', 'other'] as const;
export type Kind = (typeof KINDS)[number];

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|io|co|app|shop|store)\b)/i;
const noLink = (s: string | undefined) => !s || !LINK.test(s);

export const NewSponsor = z.object({
  name: z.string().trim().min(1).max(80).refine(noLink, 'No web addresses: sponsors are thanked, not advertised'),
  kind: z.enum(KINDS),
  thanks: z.string().trim().max(200).refine(noLink, 'No web addresses: sponsors are thanked, not advertised').optional(),
  since: z.iso.date().optional(),
  poolId: z.uuid().optional(),
  communitySlug: z.string().trim().min(1).max(60).optional(),
});

export const SponsorPatch = z.object({ hidden: z.boolean() });
export const SettingsPatch = z.object({ pageEnabled: z.boolean() });

export async function settings(q: Queryable) {
  const { rows } = await q.query<{ sponsors_page_enabled: boolean }>('select sponsors_page_enabled from public.sponsor_settings');
  return { pageEnabled: rows[0]?.sponsors_page_enabled === true };
}

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.sponsor_settings set sponsors_page_enabled = $1, updated_at = now()', [p.pageEnabled]);
  return settings(q);
}

export async function create(q: Queryable, adminId: string, s: z.infer<typeof NewSponsor>) {
  if (s.kind === 'pool' && !s.poolId) throw badRequest('Choose the token pool this sponsor gave to');
  if (s.kind === 'community' && !s.communitySlug) throw badRequest('Choose the community this sponsor supports');
  if (s.poolId) {
    const { rowCount } = await q.query('select 1 from public.token_pools where id = $1', [s.poolId]);
    if (!rowCount) throw notFound('Token pool');
  }
  let communityId: string | null = null;
  if (s.communitySlug) {
    const { rows } = await q.query<{ id: string }>('select id from public.communities where slug = $1', [s.communitySlug]);
    if (!rows[0]) throw notFound('Community');
    communityId = rows[0].id;
  }
  const { rows } = await q.query(
    `insert into public.sponsors (name, kind, thanks, since, pool_id, community_id, created_by)
     values ($1, $2, $3, coalesce($4::date, current_date), $5, $6, $7) returning *`,
    [s.name, s.kind, s.thanks || null, s.since ?? null, s.poolId ?? null, communityId, adminId],
  );
  return rows[0];
}

export async function setHidden(q: Queryable, id: string, hidden: boolean) {
  const { rows } = await q.query(
    'update public.sponsors set hidden_at = case when $2 then coalesce(hidden_at, now()) else null end where id = $1 returning *',
    [id, hidden],
  );
  if (!rows[0]) throw notFound('Sponsor');
  return rows[0];
}

/** Every sponsor, hidden ones included, for Admin. */
export async function list(q: Queryable) {
  const { rows } = await q.query(
    `select s.*, tp.name as pool_name, c.name as community_name from public.sponsors s
       left join public.token_pools tp on tp.id = s.pool_id
       left join public.communities c on c.id = s.community_id
      order by s.since desc, s.id desc`,
  );
  return rows;
}

export interface PublicSponsor {
  name: string;
  kind: Kind;
  thanks: string | null;
  since: string;
  /** The pool or community it supports, when there is one. */
  for: string | null;
}

/** What the public page shows, or { enabled: false } while it is switched off. */
export async function publicList(q: Queryable): Promise<{ enabled: false } | { enabled: true; sponsors: PublicSponsor[] }> {
  if (!(await settings(q)).pageEnabled) return { enabled: false };
  const { rows } = await q.query<{ name: string; kind: Kind; thanks: string | null; since: string; pool_name: string | null; community_name: string | null }>(
    `select s.name, s.kind, s.thanks, to_char(s.since, 'YYYY-MM-DD') as since, tp.name as pool_name, c.name as community_name
       from public.sponsors s
       left join public.token_pools tp on tp.id = s.pool_id
       left join public.communities c on c.id = s.community_id
      where s.hidden_at is null
      order by s.since, s.id`,
  );
  return { enabled: true, sponsors: rows.map((r) => ({ name: r.name, kind: r.kind, thanks: r.thanks, since: r.since, for: r.pool_name ?? r.community_name })) };
}

const HEADINGS: Record<Kind, string> = {
  launch: 'Founding sponsors',
  fund: 'Common Prayer Fund',
  witness: 'Witness team',
  pool: 'Token pools',
  community: 'Community spaces',
  other: 'With thanks',
};

/** The public page body (wrapped by the site layout). */
export function pageHtml(sponsors: PublicSponsor[], esc: (s: string) => string): string {
  const groups = KINDS.map((k) => [k, sponsors.filter((s) => s.kind === k)] as const).filter(([, list]) => list.length);
  const body = groups
    .map(
      ([k, list]) =>
        `<h2>${HEADINGS[k]}</h2>\n${list
          .map((s) => `<div class="card"><h3>${esc(s.name)}</h3>${s.for ? `<p>For ${esc(s.for)}</p>` : ''}${s.thanks ? `<p>${esc(s.thanks)}</p>` : ''}<p class="notice">Since ${s.since}</p></div>`)
          .join('\n')}`,
    )
    .join('\n');
  return `<h1>Thank you to our sponsors</h1>
<p class="lede">These people and groups help pay for the servers, the radio, the Common Prayer Fund and the Witness team. Sponsors fund reach and help, not promotion: there are no ads, no logos and no links here, and no sponsor can buy a place in anyone's feed.</p>
${body || '<p>No sponsors yet.</p>'}`;
}
