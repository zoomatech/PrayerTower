// The pilot report for sponsors: one self-contained HTML page (print it to PDF
// from any browser) with the headline numbers, a weekly chart and the weekly
// table. Counts only: no names, no request text. Admins download it from
// Admin → Pilot metrics; SPONSOR_REPORT_TO also gets it by email every Monday.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import type { Mailer } from '../digest/mailer.js';
import { weekly, type PilotWeek } from './report.js';

export type ReportLang = 'en' | 'es';

const L = {
  en: {
    title: 'Prayer Tower pilot report',
    period: (from: string, to: string, n: number) => `${n} weeks, ${from} to ${to}`,
    generated: 'Generated',
    thisWeek: 'Last full week',
    total: 'Whole pilot so far',
    vs: (d: string) => `${d} vs the week before`,
    chart: 'Prayers each week',
    chartNote: '"Praying now" taps and promise check-ins.',
    table: 'Week by week',
    privacy: 'Counts only. This report holds no names, messages or request text.',
    cols: {
      week_start: 'Week of',
      new_members: 'New members',
      requests_posted: 'Requests',
      prayers_answered: 'Answered',
      praying_now_taps: 'Praying now',
      active_pray_ers: 'People praying',
      commitments_made: 'Promises',
      commitment_checkins: 'Check-ins',
      encouragements: 'Encouragements',
      moderation_items: 'Flags',
      removals: 'Removed',
    },
  },
  es: {
    title: 'Informe del piloto de Prayer Tower',
    period: (from: string, to: string, n: number) => `${n} semanas, del ${from} al ${to}`,
    generated: 'Generado',
    thisWeek: 'Última semana completa',
    total: 'Todo el piloto hasta hoy',
    vs: (d: string) => `${d} frente a la semana anterior`,
    chart: 'Oraciones por semana',
    chartNote: 'Toques de "Orando ahora" y registros de promesas.',
    table: 'Semana a semana',
    privacy: 'Solo cifras. Este informe no contiene nombres, mensajes ni texto de peticiones.',
    cols: {
      week_start: 'Semana del',
      new_members: 'Miembros nuevos',
      requests_posted: 'Peticiones',
      prayers_answered: 'Respondidas',
      praying_now_taps: 'Orando ahora',
      active_pray_ers: 'Personas orando',
      commitments_made: 'Promesas',
      commitment_checkins: 'Registros',
      encouragements: 'Ánimos',
      moderation_items: 'Alertas',
      removals: 'Retirados',
    },
  },
} satisfies Record<ReportLang, unknown>;

const HEADLINE: (keyof PilotWeek)[] = ['new_members', 'requests_posted', 'praying_now_taps', 'active_pray_ers', 'prayers_answered', 'encouragements'];
type Count = Exclude<keyof PilotWeek, 'week_start'>;
const COUNTS = Object.keys(L.en.cols).filter((k) => k !== 'week_start') as Count[];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const prayers = (w: PilotWeek) => w.praying_now_taps + w.commitment_checkins;

function chart(rows: PilotWeek[]): string {
  const W = 640, H = 180, pad = 24;
  const max = Math.max(1, ...rows.map(prayers));
  const bw = (W - pad * 2) / Math.max(rows.length, 1);
  const bars = rows
    .map((r, i) => {
      const h = Math.round(((H - pad * 2) * prayers(r)) / max);
      const x = pad + i * bw + bw * 0.15;
      return `<rect x="${x.toFixed(1)}" y="${H - pad - h}" width="${(bw * 0.7).toFixed(1)}" height="${h}" rx="2"><title>${r.week_start}: ${prayers(r)}</title></rect>` +
        `<text x="${(x + bw * 0.35).toFixed(1)}" y="${H - pad - h - 4}" text-anchor="middle">${prayers(r)}</text>`;
    })
    .join('');
  const first = rows[0]?.week_start ?? '', last = rows.at(-1)?.week_start ?? '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(first)} – ${esc(last)}">
<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" class="axis"/>${bars}
<text x="${pad}" y="${H - 6}" class="lbl">${esc(first)}</text><text x="${W - pad}" y="${H - 6}" text-anchor="end" class="lbl">${esc(last)}</text></svg>`;
}

export function toHtml(rows: PilotWeek[], lang: ReportLang = 'en', now = new Date()): string {
  const t = L[lang];
  const n = (v: number) => v.toLocaleString(lang === 'es' ? 'es' : 'en-US');
  // The current week is still running, so the headline uses the last full one.
  const full = rows.length > 1 ? rows.slice(0, -1) : rows;
  const last = full.at(-1), prev = full.at(-2);
  const total = (k: Count) => rows.reduce((s, r) => s + r[k], 0);
  const delta = (k: Count) => {
    if (!last || !prev) return '';
    const d = last[k] - prev[k];
    return `<div class="d">${esc(t.vs(`${d >= 0 ? '+' : '−'}${n(Math.abs(d))}`))}</div>`;
  };
  const tiles = (HEADLINE as Count[])
    .map((k) => `<div class="tile"><div class="k">${esc(t.cols[k])}</div><div class="v">${n(last?.[k] ?? 0)}</div>${delta(k)}${k === 'active_pray_ers' ? '' : `<div class="d">${esc(t.total)}: ${n(total(k))}</div>`}</div>`)
    .join('');
  const head = ['week_start', ...COUNTS].map((c) => `<th>${esc(t.cols[c as keyof typeof t.cols])}</th>`).join('');
  const body = rows.map((r) => `<tr><td>${esc(r.week_start)}</td>${COUNTS.map((c) => `<td>${n(r[c])}</td>`).join('')}</tr>`).join('');
  const foot = `<tr><th>${esc(t.total)}</th>${COUNTS.map((c) => `<th>${c === 'active_pray_ers' ? '' : n(total(c))}</th>`).join('')}</tr>`;
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(t.title)}</title>
<style>
:root{--ink:#2a2438;--muted:#6b6478;--line:#e4dfec;--accent:#6b4fa0;--bg:#fff;--tile:#f7f4fb}
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);margin:0 auto;max-width:960px;padding:32px 16px;line-height:1.45}
h1{margin:0;font-size:26px}h2{font-size:17px;margin:28px 0 8px}.sub{color:var(--muted);margin:4px 0 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:20px}
.tile{background:var(--tile);border-radius:10px;padding:12px 14px}.k{font-size:13px;color:var(--muted)}.v{font-size:28px;font-weight:700}.d{font-size:12px;color:var(--muted)}
svg{width:100%;height:auto}svg rect{fill:var(--accent)}svg text{font-size:11px;fill:var(--ink)}svg .lbl{fill:var(--muted)}svg .axis{stroke:var(--line)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
thead th{color:var(--muted);font-weight:600}tfoot th{border-top:2px solid var(--ink)}
footer{margin-top:24px;font-size:12px;color:var(--muted)}
@media print{body{padding:0;max-width:none}.tile{break-inside:avoid}h2{break-after:avoid}.scroll{overflow:visible}table{font-size:10px}th,td{padding:4px 3px;white-space:normal}}
@page{margin:14mm}
</style></head><body>
<h1>${esc(t.title)}</h1>
<p class="sub">${esc(t.period(rows[0]?.week_start ?? '', rows.at(-1)?.week_start ?? '', rows.length))} · ${esc(t.generated)} ${esc(now.toISOString().slice(0, 10))}</p>
<h2>${esc(t.thisWeek)}${last ? ` (${esc(last.week_start)})` : ''}</h2>
<div class="tiles">${tiles}</div>
<h2>${esc(t.chart)}</h2><p class="sub">${esc(t.chartNote)}</p>${chart(rows)}
<h2>${esc(t.table)}</h2>
<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot></table></div>
<footer>${esc(t.privacy)}</footer>
</body></html>
`;
}

/** Monday morning: email the report to SPONSOR_REPORT_TO (comma-separated), if set and SMTP is set up. */
export function weeklySponsorReportTask(q: Queryable, mailer: Mailer | null, to: string[], weeks = 12): Task {
  return async (_payload, helpers) => {
    if (!mailer || !to.length) return helpers.logger.info('sponsor report: SPONSOR_REPORT_TO or SMTP_URL not set, skipped');
    const rows = await weekly(q, weeks);
    const html = toHtml(rows);
    const text = `${L.en.title}\n\n${rows.map((r) => `${r.week_start}: ${r.requests_posted} requests, ${prayers(r)} prayers, ${r.prayers_answered} answered`).join('\n')}\n`;
    for (const addr of to) await mailer({ to: addr, subject: `${L.en.title}, week of ${rows.at(-2)?.week_start ?? rows.at(-1)?.week_start}`, text, html });
    helpers.logger.info(`sponsor report: sent to ${to.length}`);
  };
}
