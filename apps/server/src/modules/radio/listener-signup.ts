// Listener sign-up (docs/STATION_OPERATOR_GUIDE.md, "Listener sign-up"), off until an
// admin turns on listener_signup_enabled. Anyone with an RTL-SDR dongle or a radio asks
// on /listeners (or /open-circle/listeners) to run a listener node. An admin approves
// each request in Admin → Radio, which makes a one-use setup link good for 14 days. The
// link opens a guided Pi or Mac setup page; its "Make my key" button makes the node and
// shows the key once (only its hash is kept), so a key never waits in the database.
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import { esc, layout, type Brand } from '../site/index.js';
import * as coverage from './coverage.js';
import * as nodes from './nodes.js';
import * as setup from './setup.js';

export const SETUP_DAYS = 14;

export const SignUp = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email().max(320),
  place: z.string().trim().max(80).default(''),
  /** "lat,lon", only if they want to be on the coverage map; rounded to about a city. */
  location: z
    .string()
    .trim()
    .max(40)
    .default('')
    .refine((s) => s === '' || parseLocation(s) !== null, 'A location is "lat, lon", e.g. 39.8, -89.6'),
  receiver: z.enum(['rtl-sdr', 'radio', 'not-sure']),
  platform: z.enum(['pi', 'mac', 'other']),
  callSign: z
    .string()
    .trim()
    .max(10)
    .regex(/^[A-Za-z0-9/]*$/, 'A call sign is letters and digits')
    .default(''),
  note: z.string().trim().max(300).default(''),
  edition: z.enum(['prayer-tower', 'open-circle']).default('prayer-tower'),
});

export function parseLocation(s: string): { lat: number; lon: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  if (!m) return null;
  const [lat, lon] = [Number(m[1]), Number(m[2])];
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select listener_signup_enabled as on from public.token_settings');
  return rows[0]?.on === true;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set listener_signup_enabled = $1', [on]);
}

/** Adds the request once; asking again with the same email while one waits changes nothing (no address probing). */
export async function signUp(q: Queryable, input: z.infer<typeof SignUp>) {
  const loc = input.location ? parseLocation(input.location) : null;
  await q.query(
    `insert into public.listener_signups (name, email, place, lat, lon, receiver, platform, call_sign, note, edition)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (lower(email)) where status = 'pending' do nothing`,
    [
      input.name, input.email.trim(), input.place, loc ? coverage.round(loc.lat) : null, loc ? coverage.round(loc.lon) : null,
      input.receiver, input.platform, input.callSign ? input.callSign.toUpperCase() : null, input.note, input.edition,
    ],
  );
}

export interface Signup {
  id: string;
  name: string;
  email: string;
  place: string;
  lat: number | null;
  lon: number | null;
  receiver: 'rtl-sdr' | 'radio' | 'not-sure';
  platform: 'pi' | 'mac' | 'other';
  callSign: string | null;
  note: string;
  edition: 'prayer-tower' | 'open-circle';
  status: 'pending' | 'approved' | 'declined' | 'joined';
  setupExpiresAt: string | null;
  nodeId: string | null;
  createdAt: string;
}

const COLUMNS = 'id, name, email, place, lat, lon, receiver, platform, call_sign, note, edition, status, setup_expires_at, node_id, created_at';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toSignup = (r: any): Signup => ({
  id: r.id, name: r.name, email: r.email, place: r.place, lat: r.lat === null ? null : Number(r.lat), lon: r.lon === null ? null : Number(r.lon),
  receiver: r.receiver, platform: r.platform, callSign: r.call_sign, note: r.note, edition: r.edition, status: r.status,
  setupExpiresAt: r.setup_expires_at?.toISOString() ?? null, nodeId: r.node_id, createdAt: r.created_at.toISOString(),
});

/** Newest first: pending ones, then the rest. */
export async function list(q: Queryable, limit = 300): Promise<Signup[]> {
  const { rows } = await q.query(`select ${COLUMNS} from public.listener_signups order by status <> 'pending', created_at desc limit $1`, [limit]);
  return rows.map(toSignup);
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Approve a request: a new one-use setup link (an old unused one stops working).
 * Returns the path to send them; only its hash is kept.
 */
export async function approve(q: Queryable, staffId: string, id: string, now = new Date()) {
  const token = randomBytes(24).toString('base64url');
  const { rows } = await q.query(
    `update public.listener_signups set status = 'approved', setup_token_hash = $3, setup_expires_at = $4, reviewed_by = $2, reviewed_at = $5
      where id = $1 and status in ('pending', 'approved', 'declined') returning ${COLUMNS}`,
    [id, staffId, hash(token), new Date(now.getTime() + SETUP_DAYS * 86_400_000), now],
  );
  if (!rows[0]) {
    const { rowCount } = await q.query('select 1 from public.listener_signups where id = $1', [id]);
    throw rowCount ? conflict('This listener already made their key') : notFound('Listener sign-up');
  }
  const s = toSignup(rows[0]);
  return { signup: s, setupPath: `${s.edition === 'open-circle' ? '/open-circle' : ''}/listeners/setup/${token}` };
}

export async function decline(q: Queryable, staffId: string, id: string) {
  const { rows } = await q.query(
    `update public.listener_signups set status = 'declined', setup_token_hash = null, setup_expires_at = null, reviewed_by = $2, reviewed_at = now()
      where id = $1 and status in ('pending', 'approved') returning ${COLUMNS}`,
    [id, staffId],
  );
  if (!rows[0]) throw notFound('Listener sign-up');
  return toSignup(rows[0]);
}

export async function remove(q: Queryable, id: string) {
  const { rowCount } = await q.query('delete from public.listener_signups where id = $1', [id]);
  if (!rowCount) throw notFound('Listener sign-up');
}

/** The approved request behind a setup link that is still good; null otherwise. */
export async function bySetupToken(q: Queryable, token: string, now = new Date()): Promise<Signup | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows } = await q.query(`select ${COLUMNS} from public.listener_signups where setup_token_hash = $1 and status = 'approved' and setup_expires_at > $2`, [
    hash(token),
    now,
  ]);
  return rows[0] ? toSignup(rows[0]) : null;
}

/** "Make my key": the node, named after them, placed on the map if they gave a location. The key is shown once; the link is used up. */
export async function makeKey(q: Queryable, token: string, now = new Date()) {
  const s = await bySetupToken(q, token, now);
  if (!s) throw notFound('Setup link');
  const name = [s.name, s.place].filter(Boolean).join(', ').slice(0, 60);
  const { node, key } = await nodes.create(q, name);
  await q.query('update public.radio_nodes set edition = $2 where id = $1', [node.id, s.edition]);
  if (s.lat !== null && s.lon !== null) await coverage.place(q, node.id, { lat: s.lat, lon: s.lon, ...(s.place ? { place: s.place } : {}) });
  await q.query(`update public.listener_signups set status = 'joined', node_id = $2, setup_token_hash = null where id = $1`, [s.id, node.id]);
  return { key, node: { id: node.id, name: node.name } };
}

/** The station's frequency and band from the setup wizard's choice, for the listener's settings. */
export async function stationTuning(q: Queryable): Promise<{ freqHz: number | null; band: 'fm' | 'hf' | null }> {
  const c = await setup.choice(q);
  return { freqHz: c.frequencyHz ?? null, band: c.band ?? null };
}

// ---------------------------------------------------------------------------
// Pages

const input = 'width:100%;font:inherit;padding:10px';

/** /listeners: the sign-up form. Open Circle's wording with a brand. */
export function signUpPage(name: string, brand?: Brand) {
  const faith = !brand;
  const items = faith ? 'prayers' : 'messages';
  const edition = faith ? 'prayer-tower' : 'open-circle';
  return layout(
    `${name}: become a listener`,
    `<h1>Become a listener</h1>
<p class="lede">${esc(name)} sends ${items} over the radio in short bursts. A listener is a small computer near a receiver that decodes them and tells the station how clearly they came through, so the station can reach more people.</p>
<div class="card">
<h2>What you need</h2>
<ul>
  <li>A Raspberry Pi (a Pi 4 or 5 is plenty) or a Mac that stays on.</li>
  <li>A receiver: a $30 RTL-SDR USB dongle and its antenna, or a radio connected to a USB sound card.</li>
  <li>No license: listeners only receive. They never transmit.</li>
</ul>
</div>
<div class="card">
<form id="join" novalidate>
  <p><label for="name">Your name or a name for your listener</label><br><input id="name" name="name" required maxlength="60" style="${input}"></p>
  <p><label for="email">Email, for your setup link</label><br><input id="email" name="email" type="email" autocomplete="email" required maxlength="320" style="${input}"></p>
  <p><label for="place">Town or area (optional)</label><br><input id="place" name="place" maxlength="80" style="${input}"></p>
  <p><label for="location">Put me on the coverage map at "latitude, longitude" (optional; rounded to about a city)</label><br><input id="location" name="location" maxlength="40" placeholder="39.8, -89.6" style="${input}"></p>
  <fieldset><legend>What will you listen with?</legend>
    <label><input type="radio" name="receiver" value="rtl-sdr" checked> An RTL-SDR USB dongle</label><br>
    <label><input type="radio" name="receiver" value="radio"> A radio with a USB sound card</label><br>
    <label><input type="radio" name="receiver" value="not-sure"> Not sure yet</label>
  </fieldset>
  <fieldset><legend>Which computer?</legend>
    <label><input type="radio" name="platform" value="pi" checked> Raspberry Pi (or another Linux computer)</label><br>
    <label><input type="radio" name="platform" value="mac"> Mac</label><br>
    <label><input type="radio" name="platform" value="other"> Something else</label>
  </fieldset>
  <p><label for="callSign">Ham radio call sign, if you have one (optional)</label><br><input id="callSign" name="callSign" maxlength="10" autocapitalize="characters" style="${input}"></p>
  <p><label for="note">Anything we should know? (optional)</label><br><textarea id="note" name="note" maxlength="300" rows="3" style="${input}"></textarea></p>
  <p><button class="button" type="submit">Ask to become a listener</button></p>
  <p id="status" role="status" aria-live="polite"></p>
</form>
</div>
<p>A person reads each request. When yours is approved we send a setup link that walks you through it step by step. We use your email only for that, and never sell it.</p>
<script>
const f = document.getElementById('join'), s = document.getElementById('status');
const pick = (n) => (f.querySelector('input[name="' + n + '"]:checked') || {}).value;
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!f.name.value.trim()) { s.textContent = 'Please enter a name.'; return; }
  if (!f.email.value.includes('@')) { s.textContent = 'Please enter your email address.'; return; }
  s.textContent = 'Sending…';
  try {
    const r = await fetch('/listeners/join', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: f.name.value, email: f.email.value, place: f.place.value, location: f.location.value, receiver: pick('receiver'),
        platform: pick('platform'), callSign: f.callSign.value, note: f.note.value, edition: ${JSON.stringify(edition)} }) });
    s.textContent = r.ok ? 'Thank you. A person will read your request, and we will email your setup link.' : 'Something went wrong. Please check what you entered and try again.';
    if (r.ok) f.reset();
  } catch { s.textContent = 'Something went wrong. Please try again.'; }
});
</script>`,
    '/listeners',
    'en',
    brand,
  );
}

const SCRIPT_BASE = 'https://raw.githubusercontent.com/zoomatech/PrayerTower/main/apps/station/install';

/** The settings lines for this listener, with the key in place once it is made. */
export function settingsLines(o: { apiUrl: string; key: string; receiver: Signup['receiver']; freqHz: number | null; band: 'fm' | 'hf' | null; location: string }) {
  const lines = [`PRAYER_TOWER_API_URL=${o.apiUrl}`, `NODE_KEY=${o.key}`];
  if (o.receiver !== 'radio') {
    const mhz = o.freqHz ? `${(o.freqHz / 1e6).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}M` : '';
    lines.push('LISTEN_SOURCE=rtlsdr', `LISTEN_SDR_FREQ=${mhz}`);
    if (o.band === 'hf') lines.push('LISTEN_SDR_MODE=usb', 'LISTEN_SEARCH_HZ=50', ...(o.freqHz && o.freqHz < 24e6 ? ['LISTEN_SDR_DIRECT=on'] : []));
  } else if (o.band === 'hf') lines.push('LISTEN_SEARCH_HZ=50');
  if (o.location) lines.push(`NODE_LOCATION=${o.location}`);
  return lines;
}

/** /listeners/setup/<token>: the guided Pi or Mac setup, with a button that makes the key once. */
export function setupPage(s: Signup, o: { name: string; apiUrl: string; freqHz: number | null; band: 'fm' | 'hf' | null; keyPath: string; brand?: Brand }) {
  const sdr = s.receiver !== 'radio';
  const location = s.lat !== null && s.lon !== null ? `${s.lat},${s.lon}${s.place ? `,${s.place}` : ''}` : '';
  const lines = settingsLines({ apiUrl: o.apiUrl, key: 'KEY_GOES_HERE', receiver: s.receiver, freqHz: o.freqHz, band: o.band, location });
  const flag = sdr ? ' --sdr' : '';
  const pi = `curl -fsSL ${SCRIPT_BASE}/get-station.sh | sudo bash -s -- --listener-only${flag}`;
  const mac = `curl -fsSL ${SCRIPT_BASE}/mac/install-mac.sh | bash -s -- --listener-only${flag}`;
  const piFile = '/etc/prayer-tower-listener.env';
  const macFile = '~/Library/Application Support/PrayerTower/config/listener.env';
  const isMac = s.platform === 'mac';
  const code = (t: string) => `<pre style="white-space:pre-wrap;word-break:break-all;background:#f3f1ee;padding:10px;border-radius:8px"><code>${esc(t)}</code></pre>`;
  const piSteps = `<h2>On a Raspberry Pi</h2>
<ol>
  <li>Put Raspberry Pi OS Lite on a memory card with Raspberry Pi Imager, turn on SSH, and start the Pi.</li>
  <li>${sdr ? 'Plug the RTL-SDR dongle into a USB port and connect its antenna.' : "Connect the radio's audio out to a USB sound card on the Pi."}</li>
  <li>Sign in to the Pi and run:${code(pi)}</li>
  <li>Make your key below, then put your settings in <code>${piFile}</code> with <code>sudo nano ${piFile}</code>.</li>
  <li>Start it: ${code('sudo systemctl start prayer-tower-listener\njournalctl -u prayer-tower-listener -f')}</li>
</ol>`;
  const macSteps = `<h2>On a Mac</h2>
<ol>
  <li>Install <a href="https://brew.sh">Homebrew</a> if you don't have it.</li>
  <li>${sdr ? 'Plug the RTL-SDR dongle into a USB port and connect its antenna.' : "Connect the radio's audio out to a USB sound card."}</li>
  <li>In Terminal, run:${code(mac)}</li>
  <li>Make your key below, then put your settings in <code>${esc(macFile)}</code>.</li>
  <li>Run the same command again: it starts the listener and keeps it running.</li>
</ol>`;
  const tuneNote = sdr && !o.freqHz ? '<p>Your coordinator will tell you the station frequency for <code>LISTEN_SDR_FREQ</code>.</p>' : '';
  const radioNote = s.receiver === 'radio' ? '<p>Tune the radio to the station, set its volume so the sound card is not clipping, and see the operator guide for choosing the sound card (<code>LISTEN_RECORD_CMD</code>).</p>' : '';
  return layout(
    'Set up your listener',
    `<h1>Set up your listener, ${esc(s.name)}</h1>
<p class="lede">Thank you for listening for ${esc(o.name)}. These steps take about twenty minutes. Your listener only receives; it never transmits.</p>
<div class="card">${isMac ? macSteps : piSteps}</div>
<div class="card">
<h2>Your key and settings</h2>
<p>Make your key when you are ready to paste it. It is shown once, and this link stops working after that.</p>
<p><button class="button" id="make" type="button">Make my key</button></p>
<p id="status" role="status" aria-live="polite"></p>
<div id="out" hidden><p>Your settings, with your key:</p>${code(lines.join('\n')).replace('<code>', '<code id="lines">')}<p><button class="button" id="copy" type="button">Copy</button></p></div>
${tuneNote}${radioNote}
</div>
<div class="card">${isMac ? piSteps : macSteps}</div>
<p>Keep your key private: anyone with it can send reports as your listener. If it gets out, ask us for a new one.</p>
<script>
const $ = (id) => document.getElementById(id);
const LINES = ${JSON.stringify(lines.join('\n'))};
$('make').onclick = async () => {
  $('make').disabled = true;
  $('status').textContent = 'Making your key…';
  try {
    const r = await fetch(${JSON.stringify(o.keyPath)}, { method: 'POST' });
    if (!r.ok) { $('status').textContent = 'This link has already been used or has expired. Ask us for a new one.'; return; }
    const { key } = await r.json();
    $('lines').textContent = LINES.replace('KEY_GOES_HERE', key);
    $('out').hidden = false;
    $('status').textContent = 'Here is your key. Copy your settings now: they are not shown again.';
  } catch { $('status').textContent = 'Something went wrong. Please try again.'; $('make').disabled = false; }
};
$('copy').onclick = () => navigator.clipboard && navigator.clipboard.writeText($('lines').textContent).then(() => { $('status').textContent = 'Copied.'; });
</script>`,
    '',
    'en',
    o.brand,
  );
}

/** The email with the setup link, in the edition's words. */
export function setupEmail(s: Signup, name: string, url: string) {
  const text = [
    `Hello ${s.name},`,
    '',
    `Your request to become a listener for ${name} is approved. This link walks you through setting it up and makes your key:`,
    '',
    url,
    '',
    `The link works once and for ${SETUP_DAYS} days. Your listener only receives; it never transmits.`,
    '',
    'Thank you for listening.',
    '',
  ].join('\n');
  const html = `<p>Hello ${esc(s.name)},</p><p>Your request to become a listener for ${esc(name)} is approved. This link walks you through setting it up and makes your key:</p>
<p><a href="${esc(url)}">${esc(url)}</a></p><p>The link works once and for ${SETUP_DAYS} days. Your listener only receives; it never transmits.</p><p>Thank you for listening.</p>`;
  return { to: s.email, subject: `Set up your ${name} listener`, text, html, secular: s.edition === 'open-circle' };
}
