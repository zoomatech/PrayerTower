// The weekly radio prayer digest (Admin → Radio; docs/STATION_OPERATOR_GUIDE.md,
// "Weekly radio digest"), off until an admin turns on radio_digest_enabled: how
// many radio prayers aired each week, how many a listener heard, and how many of
// the requests behind them were marked answered. Counts only: no names, no
// request text. With radio_digest_email on, Monday morning's run also emails the
// last full week to every admin.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { sendEach, type Mailer } from '../digest/mailer.js';

export interface DigestWeek {
  week_start: string;
  aired: number;
  heard: number;
  answered: number;
  thanksgiving: number;
  praying_too: number;
  failed: number;
}

export async function settings(q: Queryable) {
  const { rows } = await q.query<{ enabled: boolean; email: boolean }>('select radio_digest_enabled as enabled, radio_digest_email as email from public.token_settings');
  return rows[0]!;
}

export async function updateSettings(q: Queryable, p: { enabled?: boolean; email?: boolean }) {
  await q.query('update public.token_settings set radio_digest_enabled = coalesce($1, radio_digest_enabled), radio_digest_email = coalesce($2, radio_digest_email)', [
    p.enabled ?? null,
    p.email ?? null,
  ]);
  return settings(q);
}

/** The last `weeks` weeks (Monday to Sunday, UTC), oldest first; the last one is the week so far. */
export async function weeks(q: Queryable, weeks = 8, now = new Date()): Promise<DigestWeek[]> {
  const { rows } = await q.query<DigestWeek>(
    `with w as (
       select generate_series(date_trunc('week', $2::timestamptz at time zone 'UTC') - make_interval(weeks => $1 - 1),
                              date_trunc('week', $2::timestamptz at time zone 'UTC'), interval '1 week') as start
     )
     select to_char(w.start, 'YYYY-MM-DD') as week_start,
            (select count(*)::int from public.radio_prayers r where r.kind in ('prayer', 'auto') and r.status = 'transmitted'
               and r.transmitted_at at time zone 'UTC' >= w.start and r.transmitted_at at time zone 'UTC' < w.start + interval '1 week') as aired,
            (select count(*)::int from public.radio_prayers r where r.kind in ('prayer', 'auto') and r.status = 'transmitted' and r.heard_at is not null
               and r.transmitted_at at time zone 'UTC' >= w.start and r.transmitted_at at time zone 'UTC' < w.start + interval '1 week') as heard,
            (select count(*)::int from public.posts p where p.answered_at at time zone 'UTC' >= w.start and p.answered_at at time zone 'UTC' < w.start + interval '1 week'
               and exists (select 1 from public.radio_prayers r where r.post_id = p.id and r.kind in ('prayer', 'auto') and r.status = 'transmitted')) as answered,
            (select count(*)::int from public.radio_prayers r where r.kind = 'thanksgiving' and r.status = 'transmitted'
               and r.transmitted_at at time zone 'UTC' >= w.start and r.transmitted_at at time zone 'UTC' < w.start + interval '1 week') as thanksgiving,
            (select coalesce(sum(r.listener_praying), 0)::int from public.radio_prayers r where r.status = 'transmitted'
               and r.transmitted_at at time zone 'UTC' >= w.start and r.transmitted_at at time zone 'UTC' < w.start + interval '1 week') as praying_too,
            (select count(*)::int from public.radio_prayers r where r.status = 'failed'
               and r.created_at at time zone 'UTC' >= w.start and r.created_at at time zone 'UTC' < w.start + interval '1 week') as failed
       from w order by w.start`,
    [weeks, now.toISOString()],
  );
  return rows;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '');

export function toText(w: DigestWeek): string {
  return [
    `Radio prayers, week of ${w.week_start}`,
    '',
    `Aired: ${w.aired}`,
    `Heard by a listener: ${w.heard}${w.aired ? ` (${pct(w.heard, w.aired)})` : ''}`,
    `Requests marked answered: ${w.answered}`,
    `Thanksgiving bursts: ${w.thanksgiving}`,
    `"I'm praying too" taps: ${w.praying_too}`,
    `Failed: ${w.failed}`,
    '',
    'Counts only: no names and no request text.',
    '',
  ].join('\n');
}

export function toHtml(w: DigestWeek, history: DigestWeek[]): string {
  const row = (label: string, v: number, extra = '') => `<tr><td>${esc(label)}</td><td style="text-align:right">${v}${extra ? ` <span style="color:#6b6478">(${extra})</span>` : ''}</td></tr>`;
  const past = history
    .map((h) => `<tr><td>${esc(h.week_start)}</td><td style="text-align:right">${h.aired}</td><td style="text-align:right">${h.heard}</td><td style="text-align:right">${h.answered}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Radio prayers, week of ${esc(w.week_start)}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#2a2438;max-width:560px;margin:0 auto;padding:16px">
<h1 style="font-size:20px">Radio prayers, week of ${esc(w.week_start)}</h1>
<table style="border-collapse:collapse;width:100%">${row('Aired', w.aired)}${row('Heard by a listener', w.heard, pct(w.heard, w.aired))}${row('Requests marked answered', w.answered)}${row('Thanksgiving bursts', w.thanksgiving)}${row('"I\'m praying too" taps', w.praying_too)}${row('Failed', w.failed)}</table>
<h2 style="font-size:16px">Recent weeks</h2>
<table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left">Week of</th><th style="text-align:right">Aired</th><th style="text-align:right">Heard</th><th style="text-align:right">Answered</th></tr>${past}</table>
<p style="color:#6b6478;font-size:12px">Counts only: no names and no request text. Turn this email off in Admin → Radio → Weekly radio digest.</p>
</body></html>`;
}

/**
 * Monday morning: store last week's digest and, with email on and SMTP set up,
 * send it to every admin. Once per week (radio_digests.emailed_at).
 */
export async function runWeekly(q: Queryable, mailer: Mailer | null, now = new Date()): Promise<{ week: string | null; emailed: number }> {
  const s = await settings(q);
  if (!s.enabled) return { week: null, emailed: 0 };
  const history = await weeks(q, 9, now);
  const last = history.at(-2)!;
  const { rows } = await q.query<{ emailed_at: Date | null }>(
    `insert into public.radio_digests (week_start, aired, heard, answered, thanksgiving, praying_too, failed) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (week_start) do update set aired = excluded.aired, heard = excluded.heard, answered = excluded.answered,
       thanksgiving = excluded.thanksgiving, praying_too = excluded.praying_too, failed = excluded.failed
     returning emailed_at`,
    [last.week_start, last.aired, last.heard, last.answered, last.thanksgiving, last.praying_too, last.failed],
  );
  if (!s.email || !mailer || rows[0]!.emailed_at) return { week: last.week_start, emailed: 0 };
  const { rows: admins } = await q.query<{ email: string }>(
    `select distinct u.email from public.user_roles r join auth.users u on u.id = r.user_id where r.role = 'admin' and u.email is not null`,
  );
  const html = toHtml(last, history.slice(0, -1).reverse());
  const emailed = await sendEach(admins, (a) => mailer({ to: a.email, subject: `Radio prayers, week of ${last.week_start}`, text: toText(last), html }));
  await q.query('update public.radio_digests set emailed_at = now() where week_start = $1', [last.week_start]);
  return { week: last.week_start, emailed };
}

export function weeklyTask(q: Queryable, mailer: Mailer | null): Task {
  return async (_payload, helpers) => {
    const r = await runWeekly(q, mailer);
    helpers.logger.info(r.week ? `radio digest: week of ${r.week}, emailed ${r.emailed}` : 'radio digest: switched off');
  };
}
