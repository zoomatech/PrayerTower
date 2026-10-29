// The weekly station report (docs/STATION_OPERATOR_GUIDE.md, "Weekly station report"),
// off until an admin turns on station_report_enabled. For admins and radio operators (the
// control operator): what the station did in a week (Monday to Sunday, UTC): bursts sent
// and air time, prayers delivered and heard, how the listener network covered it, and
// the problems it had. Admin → Radio and the operator console show it; with
// station_report_email on, Monday morning's run emails last week's to every admin and
// radio operator. Counts and node names only: never request text or who asked.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { sendEach, type Mailer } from '../digest/mailer.js';

export interface NodeWeek {
  name: string;
  receiver: string | null;
  reports: number;
  /** Median SNR of the week's reports; null when it heard nothing. */
  snrDb: number | null;
  quality: 'strong' | 'fair' | 'weak' | 'none';
}

export interface StationReport {
  weekStart: string;
  bursts: { sent: number; failed: number; airSeconds: number; prayers: number; presets: Record<string, number> };
  prayers: { delivered: number; heard: number; failed: number; waiting: number };
  listeners: { nodes: number; reporting: number; quiet: string[]; placed: number; signups: number; joined: number; cards: number; perNode: NodeWeek[] };
  problems: { total: number; byKind: Record<string, number>; burstErrors: { error: string; count: number }[] };
}

export async function settings(q: Queryable) {
  const { rows } = await q.query<{ enabled: boolean; email: boolean }>('select station_report_enabled as enabled, station_report_email as email from public.token_settings');
  return rows[0]!;
}

export async function updateSettings(q: Queryable, p: { enabled?: boolean; email?: boolean }) {
  await q.query('update public.token_settings set station_report_enabled = coalesce($1, station_report_enabled), station_report_email = coalesce($2, station_report_email)', [
    p.enabled ?? null,
    p.email ?? null,
  ]);
  return settings(q);
}

/** Same thresholds as the coverage map (coverage.ts): strong 20 dB and up, fair 10 to 20, weak under 10. */
const quality = (snr: number | null): NodeWeek['quality'] => (snr === null ? 'none' : snr >= 20 ? 'strong' : snr >= 10 ? 'fair' : 'weak');

/** Monday 00:00 UTC of the week holding `at`. */
export function weekStartOf(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/** The week starting `start` (a Monday, UTC). */
export async function build(q: Queryable, start: Date): Promise<StationReport> {
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const span = [start, end];
  const { rows: b } = await q.query<{ sent: number; failed: number; air: number; prayers: number }>(
    `select count(*) filter (where ok)::int as sent, count(*) filter (where not ok)::int as failed,
            coalesce(sum(seconds) filter (where ok), 0)::float8 as air, coalesce(sum(prayers) filter (where ok), 0)::int as prayers
       from public.station_bursts where created_at >= $1 and created_at < $2`,
    span,
  );
  const { rows: presets } = await q.query<{ preset: string; n: number }>(
    `select preset, count(*)::int as n from public.station_bursts where ok and created_at >= $1 and created_at < $2 group by preset order by n desc`,
    span,
  );
  const { rows: errors } = await q.query<{ error: string; count: number }>(
    `select error, count(*)::int as count from public.station_bursts where not ok and created_at >= $1 and created_at < $2
      group by error order by count desc, error limit 5`,
    span,
  );
  const { rows: p } = await q.query<{ delivered: number; heard: number; failed: number; waiting: number }>(
    `select count(*) filter (where status = 'transmitted' and transmitted_at >= $1 and transmitted_at < $2)::int as delivered,
            count(*) filter (where status = 'transmitted' and transmitted_at >= $1 and transmitted_at < $2 and heard_at is not null)::int as heard,
            count(*) filter (where status = 'failed' and created_at >= $1 and created_at < $2)::int as failed,
            count(*) filter (where status in ('queued', 'sending') and created_at < $2)::int as waiting
       from public.radio_prayers`,
    span,
  );
  const { rows: perNode } = await q.query<{ name: string; receiver: { kind?: string } | null; reports: number; snr: number | null; seen: Date | null; placed: boolean }>(
    `select n.name, n.receiver, count(c.id)::int as reports,
            (percentile_cont(0.5) within group (order by c.snr_db))::float8 as snr, n.last_seen_at as seen, n.lat is not null as placed
       from public.radio_nodes n left join public.channel_reports c on c.node_id = n.id and c.heard_at >= $1 and c.heard_at < $2
      where n.role = 'listener' and n.enabled and n.created_at < $2
      group by n.id order by n.name`,
    span,
  );
  const { rows: l } = await q.query<{ signups: number; joined: number; cards: number }>(
    `select (select count(*)::int from public.listener_signups where created_at >= $1 and created_at < $2) as signups,
            (select count(*)::int from public.listener_signups s join public.radio_nodes n on n.id = s.node_id where n.created_at >= $1 and n.created_at < $2) as joined,
            (select count(*)::int from public.qsl_cards where first_heard_at >= $1 and first_heard_at < $2) as cards`,
    span,
  );
  const { rows: alerts } = await q.query<{ kind: string; n: number }>(
    `select kind, count(*)::int as n from public.radio_alert_history where opened_at >= $1 and opened_at < $2 group by kind order by n desc, kind`,
    span,
  );
  const nodes = perNode.map((n) => ({
    name: n.name,
    receiver: n.receiver?.kind ?? null,
    reports: n.reports,
    snrDb: n.snr === null ? null : Math.round(n.snr * 10) / 10,
    quality: quality(n.snr),
  }));
  const byKind = Object.fromEntries(alerts.map((a) => [a.kind, a.n]));
  return {
    weekStart: start.toISOString().slice(0, 10),
    bursts: { sent: b[0]!.sent, failed: b[0]!.failed, airSeconds: Math.round(b[0]!.air), prayers: b[0]!.prayers, presets: Object.fromEntries(presets.map((r) => [r.preset, r.n])) },
    prayers: p[0]!,
    listeners: {
      nodes: nodes.length,
      reporting: nodes.filter((n) => n.reports > 0).length,
      quiet: nodes.filter((n) => n.reports === 0).map((n) => n.name),
      placed: perNode.filter((n) => n.placed).length,
      ...l[0]!,
      perNode: nodes,
    },
    problems: { total: alerts.reduce((s, a) => s + a.n, 0) + b[0]!.failed + p[0]!.failed, byKind, burstErrors: errors },
  };
}

/** Last full week and the week so far, newest first, plus the stored weeks before them (totals only). */
export async function overview(q: Queryable, now = new Date()) {
  const s = await settings(q);
  if (!s.enabled) return { ...s, thisWeek: null, lastWeek: null, history: [] };
  const thisStart = weekStartOf(now);
  const lastStart = new Date(thisStart.getTime() - 7 * 86_400_000);
  const { rows } = await q.query<{ report: StationReport }>(
    `select report from public.station_reports where week_start < $1 order by week_start desc limit 8`,
    [lastStart.toISOString().slice(0, 10)],
  );
  return { ...s, thisWeek: await build(q, thisStart), lastWeek: await build(q, lastStart), history: rows.map((r) => r.report) };
}

const LABELS: Record<string, string> = {
  no_audio_device: 'No sound card',
  ptt_failed: 'The radio did not key',
  burst_failed: 'A burst failed',
  burst_overdue: 'Prayers overdue',
  station_silent: 'Station stopped reporting',
  listener_silent: 'A listener went quiet',
  queue_empty: 'Nothing waiting',
};

const minutes = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

export function toText(r: StationReport): string {
  const lines = [
    `Station report, week of ${r.weekStart}`,
    '',
    `Bursts sent: ${r.bursts.sent} (${minutes(r.bursts.airSeconds)} on the air), failed: ${r.bursts.failed}`,
    `Prayers delivered: ${r.prayers.delivered}, heard by a listener: ${r.prayers.heard}, failed: ${r.prayers.failed}, still waiting: ${r.prayers.waiting}`,
    `Listeners: ${r.listeners.reporting} of ${r.listeners.nodes} reported${r.listeners.quiet.length ? `; quiet: ${r.listeners.quiet.join(', ')}` : ''}`,
    `New listener requests: ${r.listeners.signups}, joined: ${r.listeners.joined}, thank-you cards: ${r.listeners.cards}`,
    `Problems: ${r.problems.total}`,
    ...Object.entries(r.problems.byKind).map(([k, n]) => `  ${LABELS[k] ?? k}: ${n}`),
    ...r.problems.burstErrors.map((e) => `  Burst error (${e.count}x): ${e.error}`),
    '',
    ...r.listeners.perNode.map((n) => `${n.name}: ${n.reports} report(s)${n.snrDb === null ? '' : `, median ${n.snrDb} dB (${n.quality})`}${n.receiver ? `, ${n.receiver}` : ''}`),
    '',
  ];
  return lines.join('\n');
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function toHtml(r: StationReport): string {
  const row = (k: string, v: string | number) => `<tr><td>${esc(k)}</td><td style="text-align:right">${esc(String(v))}</td></tr>`;
  const problems = [
    ...Object.entries(r.problems.byKind).map(([k, n]) => row(LABELS[k] ?? k, n)),
    ...r.problems.burstErrors.map((e) => row(`Burst error: ${e.error}`, e.count)),
  ].join('');
  const nodes = r.listeners.perNode
    .map((n) => `<tr><td>${esc(n.name)}</td><td style="text-align:right">${n.reports}</td><td style="text-align:right">${n.snrDb === null ? '' : `${n.snrDb} dB`}</td><td>${n.quality}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Station report, week of ${esc(r.weekStart)}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#2a2438;max-width:560px;margin:0 auto;padding:16px">
<h1 style="font-size:20px">Station report, week of ${esc(r.weekStart)}</h1>
<h2 style="font-size:16px">On the air</h2>
<table style="border-collapse:collapse;width:100%">${row('Bursts sent', r.bursts.sent)}${row('Air time', minutes(r.bursts.airSeconds))}${row('Bursts failed', r.bursts.failed)}${row('Prayers delivered', r.prayers.delivered)}${row('Heard by a listener', r.prayers.heard)}${row('Prayers failed', r.prayers.failed)}${row('Still waiting', r.prayers.waiting)}</table>
<h2 style="font-size:16px">Listeners</h2>
<table style="border-collapse:collapse;width:100%">${row('Reporting', `${r.listeners.reporting} of ${r.listeners.nodes}`)}${row('On the map', r.listeners.placed)}${row('New requests', r.listeners.signups)}${row('Joined', r.listeners.joined)}${row('Thank-you cards', r.listeners.cards)}</table>
<table style="border-collapse:collapse;width:100%;margin-top:8px"><tr><th style="text-align:left">Node</th><th style="text-align:right">Reports</th><th style="text-align:right">Median</th><th style="text-align:left">Signal</th></tr>${nodes}</table>
<h2 style="font-size:16px">Problems: ${r.problems.total}</h2>
${problems ? `<table style="border-collapse:collapse;width:100%">${problems}</table>` : '<p>None this week.</p>'}
<p style="color:#6b6478;font-size:12px">Counts and listener names only. Turn this email off in Admin → Radio → Weekly station report.</p>
</body></html>`;
}

/** Monday morning: store last week's report and, with email on, send it to every admin and radio operator. Once per week. */
export async function runWeekly(q: Queryable, mailer: Mailer | null, now = new Date()): Promise<{ week: string | null; emailed: number }> {
  const s = await settings(q);
  if (!s.enabled) return { week: null, emailed: 0 };
  const start = new Date(weekStartOf(now).getTime() - 7 * 86_400_000);
  const report = await build(q, start);
  const { rows } = await q.query<{ emailed_at: Date | null }>(
    `insert into public.station_reports (week_start, report) values ($1, $2)
     on conflict (week_start) do update set report = excluded.report returning emailed_at`,
    [report.weekStart, report],
  );
  if (!s.email || !mailer || rows[0]!.emailed_at) return { week: report.weekStart, emailed: 0 };
  const { rows: to } = await q.query<{ email: string }>(
    `select distinct u.email from public.user_roles r join auth.users u on u.id = r.user_id where r.role in ('admin', 'radio_operator') and u.email is not null`,
  );
  const html = toHtml(report);
  const emailed = await sendEach(to, (a) => mailer({ to: a.email, subject: `Station report, week of ${report.weekStart}`, text: toText(report), html }));
  await q.query('update public.station_reports set emailed_at = now() where week_start = $1', [report.weekStart]);
  return { week: report.weekStart, emailed };
}

export function weeklyTask(q: Queryable, mailer: Mailer | null): Task {
  return async (_payload, helpers) => {
    const r = await runWeekly(q, mailer);
    helpers.logger.info(r.week ? `station report: week of ${r.week}, emailed ${r.emailed}` : 'station report: switched off');
  };
}
