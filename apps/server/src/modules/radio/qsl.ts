// Thank-you cards (docs/STATION_OPERATOR_GUIDE.md, "Thank-you cards"), off until an
// admin turns on qsl_cards_enabled. Like a ham radio QSL card, a card confirms that a
// listener really received the station: a listener node whose report matched prayers the
// station sent (receipts.heard) gets one card per station call sign per UTC day, with the
// date, time, preset, best signal and how many it heard. Each card has an unguessable
// /qsl/<token> link; the node's log prints it, and a listener who signed up
// (listener-signup.ts) gets it by email. A node made from an Open Circle sign-up gets
// Open Circle's words: messages, never prayers.
import { randomBytes } from 'node:crypto';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import { esc, layout, type Brand } from '../site/index.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select qsl_cards_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set qsl_cards_enabled = $1', [on]);
}

export interface Card {
  token: string;
  node: string;
  callSign: string;
  day: string;
  serial: number;
  preset: string;
  bestSnrDb: number;
  prayers: number;
  firstHeardAt: string;
  lastHeardAt: string;
  edition: 'prayer-tower' | 'open-circle';
}

/** The card's path, in the node's edition. */
export const cardPath = (c: Pick<Card, 'token' | 'edition'>) => `${c.edition === 'open-circle' ? '/open-circle' : ''}/qsl/${c.token}`;

/**
 * A node's confirmed reception: `matched` prayers the station really sent. Makes today's
 * card for this call sign or adds to it. Null while cards are off or nothing matched;
 * `new` is true only the first time today, so the listener is told once.
 */
export async function confirm(
  q: Queryable,
  nodeId: string,
  report: { callSign: string; preset: string; snrDb: number },
  matched: number,
  now = new Date(),
): Promise<(Card & { new: boolean; email: string | null }) | null> {
  if (matched < 1 || !(await enabled(q))) return null;
  const callSign = report.callSign.toUpperCase();
  const { rows } = await q.query(
    `insert into public.qsl_cards (token, node_id, call_sign, day, serial, preset, best_snr_db, prayers, first_heard_at, last_heard_at)
     values ($1, $2, $3, ($6::timestamptz at time zone 'UTC')::date,
             (select coalesce(max(serial), 0) + 1 from public.qsl_cards where call_sign = $3), $4, $5, $7, $6, $6)
     on conflict (node_id, call_sign, day) do update
       set prayers = public.qsl_cards.prayers + excluded.prayers,
           best_snr_db = greatest(public.qsl_cards.best_snr_db, excluded.best_snr_db),
           last_heard_at = excluded.last_heard_at
     returning token, call_sign, to_char(day, 'YYYY-MM-DD') as day, serial, preset, round(best_snr_db::numeric, 1)::float8 as best_snr_db, prayers,
               first_heard_at, last_heard_at, (xmax = 0) as inserted`,
    [randomBytes(18).toString('base64url'), nodeId, callSign, report.preset, Math.round(report.snrDb * 10) / 10, now, matched],
  );
  const r = rows[0]!;
  const { rows: who } = await q.query<{ name: string; edition: Card['edition']; email: string | null }>(
    `select n.name, n.edition, (select s.email from public.listener_signups s where s.node_id = n.id order by s.created_at desc limit 1) as email
       from public.radio_nodes n where n.id = $1`,
    [nodeId],
  );
  return { ...toCard({ ...r, node: who[0]!.name, edition: who[0]!.edition }), new: r.inserted, email: who[0]!.email };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toCard = (r: any): Card => ({
  token: r.token, node: r.node, callSign: r.call_sign, day: r.day, serial: r.serial, preset: r.preset, bestSnrDb: r.best_snr_db, prayers: r.prayers,
  firstHeardAt: new Date(r.first_heard_at).toISOString(), lastHeardAt: new Date(r.last_heard_at).toISOString(), edition: r.edition,
});

const SELECT = `select c.token, n.name as node, n.edition, c.call_sign, to_char(c.day, 'YYYY-MM-DD') as day, c.serial, c.preset,
                       round(c.best_snr_db::numeric, 1)::float8 as best_snr_db, c.prayers, c.first_heard_at, c.last_heard_at
                  from public.qsl_cards c join public.radio_nodes n on n.id = c.node_id`;

/** The card behind a link, while cards are on; 404 otherwise. */
export async function byToken(q: Queryable, token: string): Promise<Card> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !(await enabled(q))) throw notFound('Card');
  const { rows } = await q.query(`${SELECT} where c.token = $1`, [token]);
  if (!rows[0]) throw notFound('Card');
  return toCard(rows[0]);
}

/** Admin → Radio: the newest cards. */
export async function recent(q: Queryable, limit = 50): Promise<Card[]> {
  const { rows } = await q.query(`${SELECT} order by c.last_heard_at desc limit $1`, [limit]);
  return rows.map(toCard);
}

/** "14:05 UTC" */
const utcTime = (iso: string) => `${iso.slice(11, 16)} UTC`;

/** The card as a page: printable, like a paper QSL card. */
export function cardPage(c: Card, stationName: string, brand?: Brand) {
  const faith = c.edition === 'prayer-tower';
  const items = faith ? (c.prayers === 1 ? 'prayer' : 'prayers') : c.prayers === 1 ? 'message' : 'messages';
  const accent = faith ? '#5B3E96' : '#1D6F6A';
  const row = (k: string, v: string) => `<tr><th scope="row" style="text-align:left;padding:6px 12px 6px 0;font-weight:600">${k}</th><td style="padding:6px 0">${v}</td></tr>`;
  return layout(
    `Thank-you card from ${c.callSign}`,
    `<style>@media print { header, footer, nav, .noprint { display: none !important; } }</style>
<div class="card" style="border:3px solid ${accent};border-radius:16px;padding:24px;max-width:560px">
  <p style="margin:0;color:${accent};font-weight:700;letter-spacing:.08em;text-transform:uppercase">Confirmed reception</p>
  <h1 style="margin:.2em 0;font-size:2.4em;letter-spacing:.04em">${esc(c.callSign)}</h1>
  <p class="lede">To <strong>${esc(c.node)}</strong>: thank you for listening to ${esc(stationName)}. Your listener decoded ${c.prayers} ${items} we sent on the air.</p>
  <table style="border-collapse:collapse">
    ${row('Date', `${esc(c.day)} (UTC)`)}
    ${row('First heard', esc(utcTime(c.firstHeardAt)))}
    ${row('Last heard', esc(utcTime(c.lastHeardAt)))}
    ${row('Mode', esc(c.preset))}
    ${row('Best signal', `${c.bestSnrDb.toFixed(1)} dB SNR`)}
    ${row(faith ? 'Prayers heard' : 'Messages heard', String(c.prayers))}
    ${row('Card', `No. ${c.serial}`)}
  </table>
  <p style="margin-top:1em">Thank you, and 73.</p>
</div>
<p class="noprint"><button class="button" type="button" onclick="window.print()">Print or save this card</button></p>`,
    '',
    'en',
    brand,
  );
}

/** The email with a new card's link. */
export function cardEmail(c: Card, to: string, stationName: string, url: string) {
  const faith = c.edition === 'prayer-tower';
  const items = faith ? 'prayers' : 'messages';
  const text = [`Thank you for listening to ${stationName}.`, '', `Your listener ${c.node} decoded ${items} from ${c.callSign} on ${c.day}. Here is your thank-you card:`, '', url, ''].join('\n');
  const html = `<p>Thank you for listening to ${esc(stationName)}.</p><p>Your listener ${esc(c.node)} decoded ${items} from ${esc(c.callSign)} on ${esc(c.day)}. Here is your thank-you card:</p><p><a href="${esc(url)}">${esc(url)}</a></p>`;
  return { to, subject: `Your thank-you card from ${c.callSign}`, text, html, secular: !faith };
}
