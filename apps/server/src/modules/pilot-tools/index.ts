// Pilot tools (docs/PILOT_TOOLS.md), each off until an admin turns it on:
// - "Tell Steve": a shortcut from the feed and Me to the feedback inbox (modules/feedback).
// - A weekly feedback summary for admins, as a notice and, with SMTP set up, an email.
// - The error log: app crashes the app reports and the API's unexpected failures,
//   one row per distinct error with a count, for Admin → Error log.
import { createHash } from 'node:crypto';
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import { sendEach, type Mailer } from '../digest/mailer.js';
import * as notifications from '../notifications/index.js';
import { esc } from '../site/index.js';

export interface PilotToolsSettings {
  tell_founder_enabled: boolean;
  founder_name: string;
  feedback_summary_enabled: boolean;
  feedback_summary_email: boolean;
  error_capture_enabled: boolean;
}

export async function settings(q: Queryable): Promise<PilotToolsSettings> {
  const { rows } = await q.query<PilotToolsSettings>(
    'select tell_founder_enabled, founder_name, feedback_summary_enabled, feedback_summary_email, error_capture_enabled from public.pilot_tools_settings',
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  tellFounder: z.boolean().optional(),
  founderName: z.string().trim().min(1).max(40).optional(),
  feedbackSummary: z.boolean().optional(),
  feedbackSummaryEmail: z.boolean().optional(),
  errorCapture: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<PilotToolsSettings> {
  await q.query(
    `update public.pilot_tools_settings set
        tell_founder_enabled = coalesce($1, tell_founder_enabled), founder_name = coalesce($2, founder_name),
        feedback_summary_enabled = coalesce($3, feedback_summary_enabled), feedback_summary_email = coalesce($4, feedback_summary_email),
        error_capture_enabled = coalesce($5, error_capture_enabled)`,
    [p.tellFounder ?? null, p.founderName ?? null, p.feedbackSummary ?? null, p.feedbackSummaryEmail ?? null, p.errorCapture ?? null],
  );
  return settings(q);
}

/** What the app needs to show the shortcut. */
export async function tellFounder(q: Queryable) {
  const s = await settings(q);
  return { enabled: s.tell_founder_enabled, name: s.founder_name };
}

// The error log --------------------------------------------------------------------

export const AppErrorReport = z.object({
  message: z.string().trim().min(1).max(2000),
  detail: z.string().max(8000).optional(),
  screen: z.string().trim().min(1).max(200).default('unknown'),
  platform: z.string().max(20).optional(),
  appVersion: z.string().max(40).optional(),
});

// Ids, emails and long numbers would split one error into many rows, and are nobody's business here.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;
const NUMBER = /\b\d{5,}\b/g;
export const scrub = (s: string) => s.replace(UUID, ':id').replace(EMAIL, ':email').replace(NUMBER, ':n');

export interface ErrorInput {
  source: 'app' | 'server';
  place: string;
  message: string;
  detail?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  userId?: string | null;
}

/** Adds one occurrence; the same error again only raises its count. Nothing is kept while the log is off. */
export async function record(q: Queryable, e: ErrorInput): Promise<boolean> {
  if (!(await settings(q)).error_capture_enabled) return false;
  const place = scrub(e.place).slice(0, 200);
  const message = scrub(e.message).slice(0, 500);
  const detail = e.detail ? scrub(e.detail).slice(0, 4000) : null;
  const fingerprint = createHash('sha256').update(`${e.source}\n${place}\n${message}`).digest('hex');
  await q.query(
    `insert into public.error_reports (source, fingerprint, place, message, detail, platform, app_version, last_user_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (fingerprint) do update set count = public.error_reports.count + 1, last_seen = now(), resolved_at = null,
       detail = coalesce(excluded.detail, public.error_reports.detail), platform = coalesce(excluded.platform, public.error_reports.platform),
       app_version = coalesce(excluded.app_version, public.error_reports.app_version), last_user_id = coalesce(excluded.last_user_id, public.error_reports.last_user_id)`,
    [e.source, fingerprint, place, message, detail, e.platform ?? null, e.appVersion ?? null, e.userId ?? null],
  );
  return true;
}

export const ErrorFilter = z.object({
  status: z.enum(['open', 'resolved', 'all']).default('open'),
  source: z.enum(['app', 'server']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export interface ErrorRow {
  id: string;
  source: 'app' | 'server';
  place: string;
  message: string;
  detail: string | null;
  platform: string | null;
  appVersion: string | null;
  count: number;
  lastUser: { id: string; name: string } | null;
  firstSeen: string;
  lastSeen: string;
  resolvedAt: string | null;
}

/** Most recent first. */
export async function list(q: Queryable, f: Partial<z.infer<typeof ErrorFilter>> = {}): Promise<ErrorRow[]> {
  const { status, source, limit } = ErrorFilter.parse(f);
  const { rows } = await q.query(
    `select e.*, coalesce(nullif(p.display_name, ''), 'Member') as user_name
       from public.error_reports e left join public.profiles p on p.id = e.last_user_id
      where ($1 = 'all' or ($1 = 'open') = (e.resolved_at is null)) and ($2::text is null or e.source = $2)
      order by e.last_seen desc limit $3`,
    [status, source ?? null, limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    source: r.source,
    place: r.place,
    message: r.message,
    detail: r.detail,
    platform: r.platform,
    appVersion: r.app_version,
    count: r.count,
    lastUser: r.last_user_id ? { id: r.last_user_id, name: r.user_name } : null,
    firstSeen: r.first_seen.toISOString(),
    lastSeen: r.last_seen.toISOString(),
    resolvedAt: r.resolved_at?.toISOString() ?? null,
  }));
}

/** Marked fixed; it opens again if it happens again. */
export async function resolve(q: Queryable, id: string) {
  const { rowCount } = await q.query('update public.error_reports set resolved_at = now() where id = $1 and resolved_at is null', [id]);
  if (!rowCount) throw notFound('Error');
}

// The weekly summary ---------------------------------------------------------------

export interface Summary {
  weekStart: string;
  newItems: number;
  bugs: number;
  ideas: number;
  other: number;
  openItems: number;
  blockers: number;
  errors: number;
  newest: { kind: string; body: string; name: string }[];
}

/** Last full week (Monday to Monday, UTC) of feedback, what is still open, and errors seen that week. */
export async function summary(q: Queryable, now = new Date()): Promise<Summary> {
  const { rows } = await q.query(
    `with w as (select (date_trunc('week', $1::timestamptz at time zone 'UTC') - interval '7 days') at time zone 'UTC' as start)
     select to_char(w.start at time zone 'UTC', 'YYYY-MM-DD') as week_start,
            (select count(*)::int from public.feedback f where f.created_at >= w.start and f.created_at < w.start + interval '7 days') as new_items,
            (select count(*)::int from public.feedback f where f.kind = 'bug' and f.created_at >= w.start and f.created_at < w.start + interval '7 days') as bugs,
            (select count(*)::int from public.feedback f where f.kind = 'idea' and f.created_at >= w.start and f.created_at < w.start + interval '7 days') as ideas,
            (select count(*)::int from public.feedback f where f.status = 'open') as open_items,
            (select count(*)::int from public.feedback f where f.status = 'open' and f.severity = 'blocker') as blockers,
            (select count(*)::int from public.error_reports e where e.last_seen >= w.start and e.last_seen < w.start + interval '7 days') as errors
       from w`,
    [now],
  );
  const r = rows[0]!;
  const { rows: newest } = await q.query<{ kind: string; body: string; name: string }>(
    `select f.kind, f.body, coalesce(nullif(p.display_name, ''), 'Member') as name
       from public.feedback f join public.profiles p on p.id = f.user_id
      where f.created_at >= $1::date and f.created_at < $1::date + 7
      order by case f.severity when 'blocker' then 0 when 'high' then 1 else 2 end, f.created_at desc limit 5`,
    [r.week_start],
  );
  return {
    weekStart: r.week_start,
    newItems: r.new_items,
    bugs: r.bugs,
    ideas: r.ideas,
    other: r.new_items - r.bugs - r.ideas,
    openItems: r.open_items,
    blockers: r.blockers,
    errors: r.errors,
    newest: newest.map((n) => ({ ...n, body: n.body.length > 200 ? `${n.body.slice(0, 199)}…` : n.body })),
  };
}

const line = (s: Summary) =>
  `${s.newItems} new (${s.bugs} bugs, ${s.ideas} ideas, ${s.other} other); ${s.openItems} still open${s.blockers ? `, ${s.blockers} blocking` : ''}; ${s.errors} app or server errors.`;

export function toText(s: Summary) {
  const items = s.newest.map((n) => `- ${n.name} (${n.kind}): ${n.body}`).join('\n');
  return `Pilot feedback, week of ${s.weekStart}\n\n${line(s)}\n${items ? `\nNewest:\n${items}\n` : ''}\nRead and triage them in Admin → Member feedback. Turn this email off in Admin → Pilot tools.`;
}

export function toHtml(s: Summary) {
  const items = s.newest.map((n) => `<li><b>${esc(n.name)}</b> (${esc(n.kind)}): ${esc(n.body)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pilot feedback, week of ${esc(s.weekStart)}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#2a2438;max-width:560px;margin:0 auto;padding:16px">
<h1 style="font-size:20px">Pilot feedback, week of ${esc(s.weekStart)}</h1>
<p>${esc(line(s))}</p>
${items ? `<h2 style="font-size:16px">Newest</h2><ul>${items}</ul>` : ''}
<p style="color:#6b6478;font-size:12px">Read and triage them in Admin → Member feedback. Turn this email off in Admin → Pilot tools.</p>
</body></html>`;
}

/** Monday morning: a notice to every admin and, with email on and SMTP set up, an email. Once per week. */
export async function runWeekly(q: Queryable, mailer: Mailer | null, now = new Date()): Promise<{ week: string | null; notified: number; emailed: number }> {
  const s = await settings(q);
  if (!s.feedback_summary_enabled) return { week: null, notified: 0, emailed: 0 };
  const sum = await summary(q, now);
  const { rows: fresh } = await q.query(
    `insert into public.feedback_summaries (week_start, new_items, open_items, errors) values ($1, $2, $3, $4)
     on conflict (week_start) do nothing returning week_start`,
    [sum.weekStart, sum.newItems, sum.openItems, sum.errors],
  );
  const wantEmail = s.feedback_summary_email && !!mailer;
  if (!fresh.length) {
    // Already done this week, unless a failed run left the email unsent (the retry finishes it).
    const { rows: done } = await q.query<{ emailed_at: Date | null }>('select emailed_at from public.feedback_summaries where week_start = $1', [sum.weekStart]);
    if (!wantEmail || done[0]?.emailed_at) return { week: sum.weekStart, notified: 0, emailed: 0 };
  }
  const { rows: admins } = await q.query<{ id: string; email: string | null }>(
    `select distinct r.user_id as id, u.email from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'admin'`,
  );
  for (const a of admins) {
    await notifications.notify(q, a.id, {
      kind: 'feedback_summary',
      title: `Pilot feedback, week of ${sum.weekStart}`,
      body: line(sum),
      data: { screen: 'feedback-triage' },
      dedupeKey: `feedback_summary:${sum.weekStart}:${a.id}`,
    });
  }
  let emailed = 0;
  if (wantEmail) {
    emailed = await sendEach(
      admins.filter((x) => x.email),
      (a) => mailer!({ to: a.email!, subject: `Pilot feedback, week of ${sum.weekStart}`, text: toText(sum), html: toHtml(sum) }),
    );
    await q.query('update public.feedback_summaries set emailed_at = now() where week_start = $1', [sum.weekStart]);
  }
  return { week: sum.weekStart, notified: admins.length, emailed };
}

export function weeklyTask(q: Queryable, mailer: Mailer | null): Task {
  return async (_payload, helpers) => {
    const r = await runWeekly(q, mailer);
    helpers.logger.info(r.week ? `feedback summary: week of ${r.week}, ${r.notified} notified, ${r.emailed} emailed` : 'feedback summary: switched off');
  };
}
