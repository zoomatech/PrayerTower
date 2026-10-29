// The public "Prayers on the air" page (/on-the-air, off unless Admin → Radio
// turns it on): what the station really sent, as counts only. It never shows
// a prayer's words, who sent or asked for it, or anything about a listener.
// Simulated bursts and the log transmitter are left out: they never went out.
import type { Queryable } from '../../db.js';
import { esc, layout, type Brand } from '../site/index.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select on_air_page_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

export interface OnAirStats {
  day: number;
  week: number;
  total: number;
  /** Prayers a listener reported hearing (receipts) in the last 7 days. */
  heardWeek: number;
  bursts: { at: string; prayers: number; seconds: number; preset: string }[];
}

export async function stats(q: Queryable): Promise<OnAirStats> {
  const { rows } = await q.query<Omit<OnAirStats, 'bursts'>>(
    `select count(*) filter (where transmitted_at > now() - interval '1 day')::int as day,
            count(*) filter (where transmitted_at > now() - interval '7 days')::int as week,
            count(*)::int as total,
            count(*) filter (where heard_at > now() - interval '7 days')::int as "heardWeek"
       from public.radio_prayers where status = 'transmitted' and transmitter = 'station'`,
  );
  const { rows: bursts } = await q.query<{ at: Date; prayers: number; seconds: number; preset: string }>(
    `select created_at as at, prayers, seconds::float8 as seconds, preset from public.station_bursts
      where ok and mode <> 'simulate' order by id desc limit 20`,
  );
  return { ...rows[0]!, bursts: bursts.map((b) => ({ ...b, at: b.at.toISOString() })) };
}

const n = (x: number) => x.toLocaleString('en-US');

export function page(s: OnAirStats, brand?: Brand): string {
  const what = brand ? 'messages' : 'prayers';
  const What = brand ? 'Messages' : 'Prayers';
  const rows = s.bursts
    .map(
      (b) =>
        `<tr><td><time datetime="${b.at}">${esc(b.at.slice(0, 16).replace('T', ' '))} UTC</time></td><td>${n(b.prayers)}</td><td>${b.seconds.toFixed(2)} s</td><td>${esc(b.preset)}</td></tr>`,
    )
    .join('');
  return layout(
    `${What} on the air`,
    `<style>table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #ddd; } .big { font-size: 2rem; font-weight: 700; margin: 0; }</style>
<h1>${What} on the air</h1>
<p class="lede">How many ${what} our radio station has sent. Counts only: never the words, and never who sent or asked.</p>
<div class="card"><p class="big">${n(s.day)}</p><p>${what} sent in the last 24 hours</p></div>
<div class="card"><p class="big">${n(s.week)}</p><p>in the last 7 days${s.heardWeek ? `, and ${n(s.heardWeek)} reported heard by listeners` : ''}</p></div>
<div class="card"><p class="big">${n(s.total)}</p><p>sent since the station began</p></div>
<h2>Latest bursts</h2>
${
  s.bursts.length
    ? `<table><thead><tr><th scope="col">When</th><th scope="col">${What}</th><th scope="col">Air time</th><th scope="col">Preset</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<p>No bursts have gone out yet.</p>'
}
<script>for (const t of document.querySelectorAll('time')) t.textContent = new Date(t.dateTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });</script>`,
    '',
    'en',
    brand,
  );
}
