// Zeffy gifts recorded automatically (Steve 2026-10-29: "if we can we should go
// with Zeffy"). Zeffy's API (https://support.zeffy.com/get-started-with-the-zeffy-api-yourg)
// lists payments at GET https://api.zeffy.com/api/v1/payments, with Stripe-style
// cursor paging (has_more, next_cursor, starting_after), and can POST a
// payment.completed webhook. The app never trusts a webhook body: it reads the
// payment ID from it and fetches that payment from the API with the org's key.
// Field names beyond id/amount/status/contactId/refund aren't published yet, so
// the parsing below is tolerant; check the first synced gifts in Admin → Giving.
import { timingSafeEqual } from 'node:crypto';
import type { Queryable } from '../../db.js';
import { AppError } from '../../errors.js';
import * as donations from './index.js';

export interface ZeffyKeys {
  apiKey: string;
  /** Put in the webhook address (?token=…) set in Zeffy → Settings → Integrations. */
  webhookToken: string | null;
  /** Tests pass a fake; the server uses the global fetch. */
  fetch?: Fetch;
}

const API = 'https://api.zeffy.com/api/v1';
export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

async function get(keys: ZeffyKeys, path: string): Promise<Obj> {
  const res = await (keys.fetch ?? (fetch as unknown as Fetch))(`${API}${path}`, { headers: { authorization: `Bearer ${keys.apiKey}`, accept: 'application/json' } });
  if (!res.ok) throw new AppError(502, 'zeffy_error', `Zeffy answered ${res.status}`);
  return obj(await res.json()) ?? {};
}

/** The payment ID in a webhook body, wherever this version of the payload puts it. */
export function webhookPaymentId(body: unknown): string | null {
  const b = obj(body);
  const data = obj(b?.data);
  return str(obj(data?.object)?.id) ?? str(obj(b?.payment)?.id) ?? str(data?.id) ?? str(b?.paymentId) ?? null;
}

export function tokenMatches(given: string | undefined, expected: string | null) {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Amount in cents. Zeffy runs on Stripe and uses Stripe's paging, so amounts are taken as cents unless set to dollars. */
function cents(p: Obj, unit: 'cents' | 'dollars') {
  const raw = typeof p.amount === 'number' ? p.amount : Number(obj(p.amount)?.value ?? p.amount);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(unit === 'dollars' ? raw * 100 : raw);
}

async function contactEmail(keys: ZeffyKeys, p: Obj) {
  const inline = obj(p.buyer) ?? obj(p.contact) ?? obj(p.payer);
  const direct = str(inline?.email) ?? str(p.email);
  if (direct) return direct;
  const id = str(p.contactId) ?? str(p.contact_id) ?? str(p.contact);
  if (!id) return null;
  const c = await get(keys, `/contacts/${encodeURIComponent(id)}`).catch(() => ({}) as Obj);
  return str(c.email) ?? str(c.emailAddress) ?? str(c.primaryEmail);
}

/**
 * Records one Zeffy payment as a gift to everyone, once (provider_ref is the payment ID),
 * crediting the member whose email matches. A refunded payment refunds the gift.
 */
export async function recordPayment(q: Queryable, keys: ZeffyKeys, p: Obj): Promise<'recorded' | 'refunded' | 'skipped'> {
  const id = str(p.id);
  if (!id) return 'skipped';
  const { rows: existing } = await q.query<{ id: string; status: string }>(`select id, status from public.donations where provider = 'zeffy' and provider_ref = $1`, [id]);
  const refunded = !!p.refund || str(p.refund_status) === 'refunded' || str(p.status) === 'refunded';
  if (existing[0]) {
    if (refunded && existing[0].status === 'paid') return (await donations.refund(q, existing[0].id, null)) ? 'refunded' : 'skipped';
    return 'skipped';
  }
  if (refunded || (str(p.status) ?? 'succeeded') !== 'succeeded') return 'skipped';
  const s = await donations.settings(q);
  const amount = cents(p, s.zeffy_amount_unit);
  if (!amount) return 'skipped';
  const email = await contactEmail(keys, p);
  const { rows: member } = email
    ? await q.query<{ id: string }>(
        `select p.id from public.profiles p join auth.users u on u.id = p.id where lower(u.email) = lower($1) and p.deleted_at is null`,
        [email],
      )
    : { rows: [] };
  const { rows } = await q.query<{ id: string }>(
    `insert into public.donations (donor_id, amount_cents, currency, provider, provider_ref, target_kind)
     values ($1, $2, $3, 'zeffy', $4, 'everyone') on conflict do nothing returning id`,
    [member[0]?.id ?? null, amount, (str(p.currency) ?? 'usd').toLowerCase().slice(0, 3), id],
  );
  if (!rows[0]) return 'skipped';
  await donations.markPaid(q, rows[0].id);
  return 'recorded';
}

/** Fetches one payment by ID (the webhook) and records it. */
export async function syncPayment(q: Queryable, keys: ZeffyKeys, paymentId: string) {
  return recordPayment(q, keys, await get(keys, `/payments/${encodeURIComponent(paymentId)}`));
}

/** Pulls recent payments (Admin → Giving → Sync from Zeffy), a catch-up for any missed webhook. */
export async function syncRecent(q: Queryable, keys: ZeffyKeys, days = 30) {
  const since = Math.floor(Date.now() / 1000) - days * 86_400;
  const counts = { recorded: 0, refunded: 0, skipped: 0 };
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ limit: '100', 'created[gte]': String(since) });
    if (cursor) params.set('starting_after', cursor);
    const list = await get(keys, `/payments?${params}`);
    const items = Array.isArray(list.data) ? list.data : [];
    for (const item of items) {
      const p = obj(item);
      if (p) counts[await recordPayment(q, keys, p)]++;
    }
    cursor = list.has_more ? (str(list.next_cursor) ?? str(obj(items[items.length - 1])?.id)) : null;
    if (!cursor) break;
  }
  return counts;
}
