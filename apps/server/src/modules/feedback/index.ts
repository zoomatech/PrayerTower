// Pilot feedback: members tell us what's broken or confusing from inside the
// app; admins triage it (tags by type, severity, a note) on Admin → Feedback,
// export it as CSV, and close it when handled.
import { FEEDBACK_SEVERITIES, FEEDBACK_TAGS, type FeedbackTag } from '@prayer-tower/shared';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

export const NewFeedback = z.object({
  kind: z.enum(['bug', 'idea', 'other']).default('other'),
  body: z.string().trim().min(1).max(2000),
  platform: z.string().max(20).optional(),
  appVersion: z.string().max(40).optional(),
});

// Words that suggest a tag. Only a starting point: an admin confirms or changes them.
const HINTS: [FeedbackTag, RegExp][] = [
  ['crash', /\b(crash\w*|freez\w*|se cierra|se cerr[oó]|se congel\w*)/i],
  ['notifications', /\b(notif\w*|push|alert\w*|aviso\w*)/i],
  ['account', /\b(log ?in|sign ?in|sign ?up|password|contraseñ\w*|cuenta|account|invite code|c[oó]digo)/i],
  ['spanish', /\b(spanish|español|espanol|traducci\w*|translat\w*)/i],
  ['accessibility', /\b(voiceover|talkback|screen reader|font size|text size|contrast|accessib\w*|accesib\w*)/i],
  ['performance', /\b(slow\w*|lag\w*|lento|loading|tarda\w*|battery|bater[ií]a)/i],
  ['confusing', /\b(confus\w*|can'?t find|where is|how do i|no entiendo|d[oó]nde)/i],
  ['praise', /\b(love|great|thank you|amazing|beautiful|me encanta|gracias|bendici\w*)/i],
];

export function suggestTags(kind: 'bug' | 'idea' | 'other', body: string): FeedbackTag[] {
  const tags = new Set<FeedbackTag>([kind]);
  for (const [tag, re] of HINTS) if (re.test(body)) tags.add(tag);
  if (tags.size > 1) tags.delete('other');
  return [...tags].slice(0, 6);
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewFeedback>) {
  const { rows } = await q.query<{ id: string }>(
    'insert into public.feedback (user_id, kind, body, platform, app_version, tags) values ($1, $2, $3, $4, $5, $6) returning id',
    [userId, input.kind, input.body, input.platform ?? null, input.appVersion ?? null, suggestTags(input.kind, input.body)],
  );
  return rows[0]!.id;
}

export const Filter = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
  tag: z.enum(FEEDBACK_TAGS).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(100),
});

/** The export takes everything, open and closed, unless told otherwise. */
export const ExportFilter = z.object({ status: z.enum(['open', 'closed', 'all']).default('all'), tag: z.enum(FEEDBACK_TAGS).optional() });

export interface FeedbackItem {
  id: string;
  kind: string;
  body: string;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
  userId: string;
  name: string;
  status: 'open' | 'closed';
  tags: FeedbackTag[];
  severity: string | null;
  note: string | null;
  triagedAt: string | null;
  closedAt: string | null;
}

/** Oldest first, so nothing waits forever; blockers and high severity on top. */
export async function list(q: Queryable, f: Partial<z.infer<typeof Filter>> = {}): Promise<FeedbackItem[]> {
  const { status, tag, limit } = Filter.parse(f);
  const { rows } = await q.query(
    `select f.id, f.kind, f.body, f.platform, f.app_version, f.created_at, f.user_id, f.status, f.tags, f.severity,
            f.admin_note, f.triaged_at, f.closed_at, coalesce(nullif(p.display_name, ''), 'Member') as name
       from public.feedback f join public.profiles p on p.id = f.user_id
      where ($1 = 'all' or f.status = $1) and ($2::text is null or $2 = any(f.tags))
      order by case f.severity when 'blocker' then 0 when 'high' then 1 else 2 end, f.created_at
      limit $3`,
    [status, tag ?? null, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    platform: r.platform,
    appVersion: r.app_version,
    createdAt: r.created_at.toISOString(),
    userId: r.user_id,
    name: r.name,
    status: r.status,
    tags: r.tags,
    severity: r.severity,
    note: r.admin_note,
    triagedAt: r.triaged_at?.toISOString() ?? null,
    closedAt: r.closed_at?.toISOString() ?? null,
  }));
}

/** Kept for the admin screen's open list. */
export const open = (q: Queryable, limit = 100) => list(q, { status: 'open', limit });

export const Triage = z
  .object({
    tags: z.array(z.enum(FEEDBACK_TAGS)).min(1).max(6).optional(),
    severity: z.enum(FEEDBACK_SEVERITIES).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((t) => t.tags !== undefined || t.severity !== undefined || t.note !== undefined, { message: 'Nothing to change' });

export async function triage(q: Queryable, adminId: string, id: string, t: z.infer<typeof Triage>) {
  const { rowCount } = await q.query(
    `update public.feedback set
        tags = coalesce($3::text[], tags),
        severity = case when $4 then $5 else severity end,
        admin_note = case when $6 then nullif($7, '') else admin_note end,
        triaged_by = $2, triaged_at = now()
      where id = $1`,
    [id, adminId, t.tags ? [...new Set(t.tags)] : null, t.severity !== undefined, t.severity ?? null, t.note !== undefined, t.note ?? null],
  );
  if (!rowCount) throw notFound('Feedback');
}

export async function close(q: Queryable, adminId: string, id: string) {
  const { rowCount } = await q.query(
    `update public.feedback set status = 'closed', closed_by = $2, closed_at = now() where id = $1 and status = 'open'`,
    [id, adminId],
  );
  if (!rowCount) throw notFound('Feedback');
}

// A cell a spreadsheet would read as a formula gets a leading quote (OWASP, CSV injection).
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(items: FeedbackItem[]): string {
  const cols = ['createdAt', 'status', 'tags', 'severity', 'kind', 'body', 'note', 'name', 'platform', 'appVersion', 'triagedAt', 'closedAt', 'id'] as const;
  return [cols.join(','), ...items.map((i) => cols.map((c) => cell(i[c])).join(','))].join('\n') + '\n';
}
