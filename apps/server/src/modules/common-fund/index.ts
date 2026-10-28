// The Common Prayer Fund's public report: money in, help sent out, and what's
// left, from admin-recorded entries (migration 20261029002700_common_fund_ledger.sql).
// Behind future_settings.common_fund_page_enabled (off by default). No money moves
// through the app, and the report never names anyone.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import * as future from '../future/index.js';

export const NewEntry = z
  .object({
    direction: z.enum(['in', 'out']),
    source: z.enum(['purchase_share', 'donation', 'help', 'other']),
    amountCents: z.number().int().min(1).max(100_000_000),
    occurredOn: z.iso.date().optional(),
    witnessCaseId: z.uuid().optional(),
    helpKind: z.string().trim().min(1).max(60).optional(),
    publicNote: z.string().trim().max(200).optional(),
  })
  .refine((e) => (e.direction === 'out') === (e.source === 'help'), { message: "Money out is 'help'; money in is a purchase share, donation or other" });

export async function record(q: Queryable, adminId: string, e: z.infer<typeof NewEntry>) {
  if (e.witnessCaseId) {
    const { rowCount } = await q.query('select 1 from public.witness_cases where id = $1', [e.witnessCaseId]);
    if (!rowCount) throw notFound('Witness case');
  }
  const { rows } = await q.query(
    `insert into public.common_fund_entries (direction, source, amount_cents, occurred_on, witness_case_id, help_kind, public_note, recorded_by)
     values ($1, $2, $3, coalesce($4::date, current_date), $5, $6, $7, $8) returning *`,
    [e.direction, e.source, e.amountCents, e.occurredOn ?? null, e.witnessCaseId ?? null, e.helpKind ?? null, e.publicNote ?? null, adminId],
  );
  return rows[0];
}

export async function voidEntry(q: Queryable, adminId: string, id: string) {
  const { rows } = await q.query('select voided_at from public.common_fund_entries where id = $1 for update', [id]);
  if (!rows[0]) throw notFound('Entry');
  if (rows[0].voided_at) throw conflict('This entry was already voided');
  const res = await q.query('update public.common_fund_entries set voided_at = now(), voided_by = $2 where id = $1 returning *', [id, adminId]);
  return res.rows[0];
}

export const ListFilter = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) });

/** Every entry, voided ones included, for the admin screen. */
export async function list(q: Queryable, f: z.infer<typeof ListFilter>) {
  const { rows } = await q.query(
    `select e.*, p.display_name as recorded_by_name from public.common_fund_entries e
       left join public.profiles p on p.id = e.recorded_by
      order by e.occurred_on desc, e.id desc limit $1`,
    [f.limit],
  );
  return rows;
}

export interface Report {
  enabled: true;
  percent: number;
  about: string;
  totals: { inCents: number; outCents: number; balanceCents: number };
  months: { month: string; inCents: number; outCents: number }[];
  helpByKind: { kind: string; times: number; cents: number }[];
  recent: { date: string; direction: 'in' | 'out'; label: string; cents: number; note: string | null }[];
  peopleHelped: number;
  helpSent: number;
}

const LABEL: Record<string, string> = { purchase_share: 'Share of token purchases', donation: 'Donation', other: 'Other income', help: 'Help sent' };

/** The public report, or { enabled: false } while the page is switched off. */
export async function report(q: Queryable): Promise<Report | { enabled: false }> {
  const base = await future.commonFund(q);
  if (!base.enabled || base.percent === undefined) return { enabled: false };
  const live = 'from public.common_fund_entries where voided_at is null';
  const [{ rows: t }, { rows: m }, { rows: k }, { rows: r }] = await Promise.all([
    q.query<{ in_c: number; out_c: number }>(
      `select coalesce(sum(amount_cents) filter (where direction = 'in'), 0)::int8::float8 as in_c,
              coalesce(sum(amount_cents) filter (where direction = 'out'), 0)::int8::float8 as out_c ${live}`,
    ),
    q.query<{ month: string; in_c: number; out_c: number }>(
      `select to_char(date_trunc('month', occurred_on), 'YYYY-MM') as month,
              coalesce(sum(amount_cents) filter (where direction = 'in'), 0)::float8 as in_c,
              coalesce(sum(amount_cents) filter (where direction = 'out'), 0)::float8 as out_c
         ${live} and occurred_on >= date_trunc('month', current_date) - interval '11 months'
        group by 1 order by 1 desc`,
    ),
    q.query<{ kind: string; times: number; cents: number }>(
      `select coalesce(nullif(lower(help_kind), ''), 'other help') as kind, count(*)::int as times, sum(amount_cents)::float8 as cents
         ${live} and direction = 'out' group by 1 order by cents desc limit 20`,
    ),
    q.query<{ date: string; direction: 'in' | 'out'; source: string; cents: number; note: string | null; help_kind: string | null }>(
      `select to_char(occurred_on, 'YYYY-MM-DD') as date, direction, source, amount_cents as cents, public_note as note, help_kind
         ${live} order by occurred_on desc, id desc limit 20`,
    ),
  ]);
  return {
    enabled: true,
    percent: base.percent,
    about: base.about!,
    peopleHelped: base.peopleHelped!,
    helpSent: base.helpSent!,
    totals: { inCents: t[0]!.in_c, outCents: t[0]!.out_c, balanceCents: t[0]!.in_c - t[0]!.out_c },
    months: m.map((x) => ({ month: x.month, inCents: x.in_c, outCents: x.out_c })),
    helpByKind: k,
    recent: r.map((x) => ({
      date: x.date,
      direction: x.direction,
      label: x.help_kind ? `${LABEL[x.source]}: ${x.help_kind}` : LABEL[x.source]!,
      cents: x.cents,
      note: x.note,
    })),
  };
}

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The report as the body of a public web page (wrapped by the site layout). */
export function reportHtml(r: Report, esc: (s: string) => string): string {
  const rows = <T,>(items: T[], cells: (x: T) => string[]) =>
    items.map((x) => `<tr>${cells(x).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<h1>Common Prayer Fund</h1>
<p class="lede">${esc(r.about)}</p>
<div class="card"><h2>So far</h2>
<p>Money in: <strong>${usd(r.totals.inCents)}</strong><br>Help sent: <strong>${usd(r.totals.outCents)}</strong><br>In the fund now: <strong>${usd(r.totals.balanceCents)}</strong></p>
<p>${r.peopleHelped} ${r.peopleHelped === 1 ? 'person' : 'people'} helped, ${r.helpSent} ${r.helpSent === 1 ? 'time' : 'times'} help was sent.</p></div>
${r.months.length ? `<h2>By month</h2><table><thead><tr><th>Month</th><th>In</th><th>Help sent</th></tr></thead><tbody>${rows(r.months, (x) => [x.month, usd(x.inCents), usd(x.outCents)])}</tbody></table>` : ''}
${r.helpByKind.length ? `<h2>Kinds of help</h2><table><thead><tr><th>Help</th><th>Times</th><th>Amount</th></tr></thead><tbody>${rows(r.helpByKind, (x) => [esc(x.kind), String(x.times), usd(x.cents)])}</tbody></table>` : ''}
${r.recent.length ? `<h2>Latest entries</h2><table><thead><tr><th>Date</th><th>What</th><th>Amount</th><th>Note</th></tr></thead><tbody>${rows(r.recent, (x) => [x.date, esc(x.label), (x.direction === 'out' ? '−' : '') + usd(x.cents), esc(x.note ?? '')])}</tbody></table>` : '<p>No entries yet.</p>'}
<p class="notice">No one is named here. The Witness team keeps the details private.</p>`;
}
