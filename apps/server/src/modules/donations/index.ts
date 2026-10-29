// Gifts, not ads (Steve 2026-10-28): "from each according to his generosity, to
// each according to his need". Money given through a payment service (Stripe or
// Zeffy, none until Steve picks one) or recorded by an admin. A paid gift adds
// Priestly tokens to its target (the shared radio fund, one member, or a token
// pool) and regular tokens to the giver. Everybody gets `everyone_monthly` free
// radio prayers a month; members can ask for more and staff grant them.
// Migration 20261029011600_donations.sql. All off by default.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as tokens from '../tokens/index.js';

export interface DonationSettings {
  enabled: boolean;
  provider: 'none' | 'stripe' | 'zeffy';
  donate_url: string | null;
  /** PayPal's Donate link: a second way to give, beside Stripe or Zeffy. */
  paypal_url: string | null;
  /** How Zeffy's API gives amounts; cents unless the first synced gifts show dollars. */
  zeffy_amount_unit: 'cents' | 'dollars';
  min_cents: number;
  max_cents: number;
  priestly_per_dollar: number;
  regular_per_dollar: number;
  everyone_monthly: number;
  allocation_requests_enabled: boolean;
  allocation_max_per_request: number;
}

/** Stripe keys from the server's env (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET); null until set. */
export interface StripeKeys {
  secretKey: string;
  webhookSecret: string | null;
}

export async function settings(q: Queryable): Promise<DonationSettings> {
  const { rows } = await q.query<DonationSettings>(
    `select enabled, provider, donate_url, paypal_url, zeffy_amount_unit, min_cents, max_cents, priestly_per_dollar, regular_per_dollar,
            everyone_monthly, allocation_requests_enabled, allocation_max_per_request from public.donation_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(['none', 'stripe', 'zeffy']),
    donateUrl: z.url().startsWith('https://').nullable(),
    paypalUrl: z.url().startsWith('https://').nullable(),
    zeffyAmountUnit: z.enum(['cents', 'dollars']),
    minCents: z.number().int().min(50).max(1_000_000),
    maxCents: z.number().int().min(50).max(100_000_000),
    priestlyPerDollar: z.number().int().min(0).max(1000),
    regularPerDollar: z.number().int().min(0).max(10_000),
    everyoneMonthly: z.number().int().min(0).max(100),
    allocationRequestsEnabled: z.boolean(),
    allocationMaxPerRequest: z.number().int().min(1).max(100),
  })
  .partial();

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<DonationSettings> {
  await q.query(
    `update public.donation_settings set
        enabled = coalesce($1, enabled), provider = coalesce($2, provider),
        donate_url = case when $3::boolean then $4 else donate_url end,
        min_cents = coalesce($5, min_cents), max_cents = coalesce($6, max_cents),
        priestly_per_dollar = coalesce($7, priestly_per_dollar), regular_per_dollar = coalesce($8, regular_per_dollar),
        everyone_monthly = coalesce($9, everyone_monthly),
        allocation_requests_enabled = coalesce($10, allocation_requests_enabled),
        allocation_max_per_request = coalesce($11, allocation_max_per_request),
        paypal_url = case when $12::boolean then $13 else paypal_url end,
        zeffy_amount_unit = coalesce($14, zeffy_amount_unit)`,
    [
      p.enabled ?? null, p.provider ?? null, p.donateUrl !== undefined, p.donateUrl ?? null, p.minCents ?? null, p.maxCents ?? null,
      p.priestlyPerDollar ?? null, p.regularPerDollar ?? null, p.everyoneMonthly ?? null, p.allocationRequestsEnabled ?? null,
      p.allocationMaxPerRequest ?? null, p.paypalUrl !== undefined, p.paypalUrl ?? null, p.zeffyAmountUnit ?? null,
    ],
  );
  return settings(q);
}

/** What the app and website need to show a Give button. */
export async function info(q: Queryable, stripe: StripeKeys | null) {
  const s = await settings(q);
  const ready = s.enabled && ((s.provider === 'zeffy' && !!s.donate_url) || (s.provider === 'stripe' && !!stripe));
  const paypalUrl = s.enabled ? s.paypal_url : null;
  return {
    enabled: ready || !!paypalUrl,
    provider: ready ? s.provider : 'none',
    url: ready && s.provider === 'zeffy' ? s.donate_url : null,
    paypalUrl,
    minCents: s.min_cents,
    maxCents: s.max_cents,
    everyoneMonthly: s.enabled ? s.everyone_monthly : 0,
    allocationRequests: s.enabled && s.allocation_requests_enabled,
  };
}

/** The public picture: money in, the shared fund, and radio prayers given out. Never names anyone. */
export async function summary(q: Queryable) {
  const s = await settings(q);
  if (!s.enabled) return { enabled: false as const };
  const { rows } = await q.query<{ total: string; month: string; givers: number; fund: string; everyone: number; allowance: number }>(
    `select coalesce(sum(amount_cents) filter (where status = 'paid'), 0) as total,
            coalesce(sum(amount_cents) filter (where status = 'paid' and paid_at > now() - interval '30 days'), 0) as month,
            count(distinct coalesce(donor_id::text, id::text)) filter (where status = 'paid')::int as givers,
            (select coalesce(sum(balance), 0) from public.token_accounts a where a.kind = 'infrastructure' and a.currency = 'priestly') as fund,
            (select count(*)::int from public.radio_prayers r where r.funded_by = 'everyone' and r.created_at > now() - interval '30 days') as everyone,
            (select count(*)::int from public.radio_prayers r where r.funded_by = 'allowance' and r.created_at > now() - interval '30 days') as allowance
       from public.donations`,
  );
  const r = rows[0]!;
  return {
    enabled: true as const,
    raisedCents: Number(r.total),
    raisedLast30DaysCents: Number(r.month),
    givers: r.givers,
    sharedFundTokens: Number(r.fund),
    radioPrayersLast30Days: { everyone: r.everyone, granted: r.allowance },
  };
}

export const Target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('everyone') }),
  z.object({ kind: z.literal('member'), userId: z.uuid() }),
  z.object({ kind: z.literal('pool'), poolId: z.uuid() }),
]);

async function checkTarget(q: Queryable, target: z.infer<typeof Target>) {
  if (target.kind === 'member') {
    const { rowCount } = await q.query('select 1 from public.profiles where id = $1 and deleted_at is null', [target.userId]);
    if (!rowCount) throw notFound('Member');
  }
  if (target.kind === 'pool') {
    const { rowCount } = await q.query('select 1 from public.token_pools where id = $1 and closed_at is null', [target.poolId]);
    if (!rowCount) throw notFound('Pool');
  }
}

async function insert(
  q: Queryable,
  d: { donorId: string | null; amountCents: number; provider: 'stripe' | 'zeffy' | 'paypal' | 'manual'; providerRef: string | null; target: z.infer<typeof Target>; showDonor: boolean; recordedBy: string | null },
) {
  const { rows } = await q.query<{ id: string }>(
    `insert into public.donations (donor_id, amount_cents, provider, provider_ref, target_kind, target_user_id, target_pool_id, show_donor, recorded_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      d.donorId, d.amountCents, d.provider, d.providerRef, d.target.kind,
      d.target.kind === 'member' ? d.target.userId : null, d.target.kind === 'pool' ? d.target.poolId : null, d.showDonor, d.recordedBy,
    ],
  );
  return rows[0]!.id;
}

/**
 * Mark a gift paid, once: the target gets Priestly tokens (a pool gets regular
 * tokens, which is what pools hold) and the giver gets regular tokens.
 */
const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export async function markPaid(q: Queryable, donationId: string) {
  const { rows } = await q.query<{ donor_id: string | null; amount_cents: number; target_kind: string; target_user_id: string | null; target_pool_id: string | null }>(
    `update public.donations set status = 'paid', paid_at = now() where id = $1 and status = 'pending'
     returning donor_id, amount_cents, target_kind, target_user_id, target_pool_id`,
    [donationId],
  );
  const d = rows[0];
  if (!d) return false; // already paid (a retried webhook) or refunded
  const s = await settings(q);
  const dollars = Math.floor(d.amount_cents / 100);
  const priestly = dollars * s.priestly_per_dollar;
  const regular = dollars * s.regular_per_dollar;
  const key = `donation:${donationId}`;
  if (d.target_kind === 'pool' && regular > 0) await tokens.creditPool(q, d.target_pool_id!, regular, `${key}:pool`, 'Gift to pool');
  if (d.target_kind === 'member' && priestly > 0) await tokens.creditPurchase(q, d.target_user_id!, priestly, `${key}:member`, 'priestly');
  if (d.target_kind === 'everyone' && priestly > 0) await tokens.creditFund(q, priestly, `${key}:fund`, 'Gift to everyone');
  if (d.donor_id && regular > 0) {
    const t = await tokens.earn(q, d.donor_id, regular, `${key}:giver`, 'Thank you for giving');
    await q.query('update public.donations set giver_transfer_id = $2 where id = $1', [donationId, t.id]);
  }
  // Gifts that clear later (a bank transfer, a Zeffy or hand-entered gift) are announced here.
  if (d.donor_id) {
    await notifications.notify(q, d.donor_id, {
      kind: 'gift_received',
      title: 'Thank you for your gift',
      body: regular > 0 ? `Your gift of ${usd(d.amount_cents)} came through. You earned ${regular} tokens to spend or give away.` : `Your gift of ${usd(d.amount_cents)} came through.`,
      data: { screen: 'give' },
    });
  }
  if (d.target_kind === 'member' && priestly > 0 && d.target_user_id !== d.donor_id) {
    await notifications.notify(q, d.target_user_id!, {
      kind: 'gift_to_you',
      title: 'Someone gave you Priestly tokens',
      body: `A gift gave you ${priestly} Priestly ${priestly === 1 ? 'token' : 'tokens'}. Spend them on radio prayers or give them to someone.`,
      data: { screen: 'give' },
    });
  }
  return true;
}

/**
 * A paid gift was refunded (Stripe's charge.refunded, or an admin). It is marked refunded and
 * the giver's thank-you tokens are taken back while they still have them. What the gift
 * already gave to everyone, a member or a pool stays given.
 */
export async function refund(q: Queryable, donationId: string, byUserId: string | null) {
  const { rows } = await q.query<{ donor_id: string | null; giver_transfer_id: string | null }>(
    `update public.donations set status = 'refunded', refunded_at = now() where id = $1 and status = 'paid' returning donor_id, giver_transfer_id`,
    [donationId],
  );
  const d = rows[0];
  if (!d) return false;
  if (d.donor_id && d.giver_transfer_id) {
    // A savepoint, so tokens already spent don't abort the caller's transaction.
    await q.query('savepoint donation_refund');
    try {
      await tokens.clawback(q, d.giver_transfer_id, byUserId ?? d.donor_id, 'Gift refunded');
      await q.query('release savepoint donation_refund');
    } catch (err) {
      await q.query('rollback to savepoint donation_refund');
      if ((err as AppError).code !== 'insufficient_tokens') throw err;
    }
  }
  return true;
}

export const ManualDonation = z.object({
  amountCents: z.number().int().min(1).max(100_000_000),
  donorId: z.uuid().nullable().default(null),
  target: Target.default({ kind: 'everyone' }),
  showDonor: z.boolean().default(false),
  reference: z.string().trim().max(120).optional(),
  /** How it came in: cash or a check, a Zeffy form, or PayPal. The reference (a receipt or transaction ID) can be recorded once. */
  via: z.enum(['manual', 'zeffy', 'paypal']).default('manual'),
});

/** An admin records a gift that came in another way (cash, check, a Zeffy form). */
export async function record(q: Queryable, adminId: string, input: z.infer<typeof ManualDonation>) {
  await checkTarget(q, input.target);
  const id = await insert(q, {
    donorId: input.donorId, amountCents: input.amountCents, provider: input.via, providerRef: input.reference || null,
    target: input.target, showDonor: input.showDonor, recordedBy: adminId,
  }).catch((err: { code?: string }) => {
    if (err.code === '23505') throw conflict('This gift was already recorded');
    throw err;
  });
  await markPaid(q, id);
  return { id };
}

export const Checkout = z.object({
  amountCents: z.number().int().min(50).max(100_000_000),
  target: Target.default({ kind: 'everyone' }),
  showDonor: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(100),
});

type StripeFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Start a Stripe Checkout for a member's gift. Bank transfer (ACH, 0.8% capped at
 * $5) is offered before cards (2.9% + 30¢): https://stripe.com/pricing.
 * https://docs.stripe.com/api/checkout/sessions/create
 */
export async function checkout(
  q: Queryable,
  stripe: StripeKeys | null,
  userId: string,
  input: z.infer<typeof Checkout>,
  urls: { success: string; cancel: string },
  fetchImpl: StripeFetch = fetch as unknown as StripeFetch,
) {
  const s = await settings(q);
  if (!s.enabled || s.provider !== 'stripe') throw forbidden('Giving in the app is not turned on');
  if (!stripe) throw new AppError(503, 'not_configured', 'The payment service is not set up yet (STRIPE_SECRET_KEY)');
  if (input.amountCents < s.min_cents || input.amountCents > s.max_cents) {
    throw badRequest(`Gifts can be from $${(s.min_cents / 100).toFixed(2)} to $${(s.max_cents / 100).toFixed(2)}`);
  }
  await checkTarget(q, input.target);
  const id = await insert(q, { donorId: userId, amountCents: input.amountCents, provider: 'stripe', providerRef: null, target: input.target, showDonor: input.showDonor, recordedBy: null });
  const form = new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'us_bank_account',
    'payment_method_types[1]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(input.amountCents),
    'line_items[0][price_data][product_data][name]': 'A gift to keep it ad-free',
    success_url: urls.success,
    cancel_url: urls.cancel,
    client_reference_id: id,
    'metadata[donation_id]': id,
  });
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${stripe.secretKey}`, 'content-type': 'application/x-www-form-urlencoded', 'idempotency-key': `donation:${userId}:${input.idempotencyKey}` },
    body: form.toString(),
  });
  const session = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!res.ok || !session.id || !session.url) throw new AppError(502, 'payment_service', session.error?.message ?? `The payment service refused (${res.status})`);
  await q.query('update public.donations set provider_ref = $2 where id = $1', [id, session.id]);
  return { donationId: id, url: session.url };
}

/** Check a Stripe-Signature header: t=…,v1=… is HMAC-SHA256 of "t.body" (https://docs.stripe.com/webhooks#verify-manually). */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]).filter((p) => p.length === 2)) as Record<string, string>;
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const want = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  return sigs.some((sig) => sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want)));
}

/** A Stripe event: a paid Checkout (card at once, bank transfer when it clears) marks its gift paid. */
type StripeObject = { id?: string; payment_status?: string; payment_intent?: string | null; refunded?: boolean; metadata?: { donation_id?: string } };

export async function stripeEvent(q: Queryable, event: { type?: string; data?: { object?: StripeObject } }) {
  const obj = event.data?.object;
  // A full refund from the Stripe Dashboard: the charge names the payment, not our gift.
  if (event.type === 'charge.refunded') {
    if (!obj?.refunded || !obj.payment_intent) return false;
    const { rows } = await q.query<{ id: string }>(`select id from public.donations where provider = 'stripe' and provider_payment = $1`, [obj.payment_intent]);
    return rows[0] ? refund(q, rows[0].id, null) : false;
  }
  const id = obj?.metadata?.donation_id;
  if (!id) return false;
  if (obj?.payment_intent) {
    await q.query('update public.donations set provider_payment = $2 where id = $1 and provider_payment is null', [id, obj.payment_intent]);
  }
  const paid =
    (event.type === 'checkout.session.completed' && obj?.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded';
  if (paid) return markPaid(q, id);
  if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
    await q.query(`update public.donations set status = 'failed' where id = $1 and status = 'pending'`, [id]);
  }
  return false;
}

export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select id, amount_cents, status, target_kind, created_at, paid_at from public.donations where donor_id = $1 order by created_at desc limit 50`,
    [userId],
  );
  return rows;
}

export async function list(q: Queryable, limit = 100) {
  const { rows } = await q.query(
    `select d.id, d.amount_cents, d.provider, d.status, d.target_kind, d.created_at, d.paid_at,
            case when d.donor_id is null then null else coalesce(nullif(p.display_name, ''), 'Member') end as donor_name
       from public.donations d left join public.profiles p on p.id = d.donor_id
      order by d.created_at desc limit $1`,
    [limit],
  );
  return rows;
}

// Radio prayers: everybody gets at least one; members can ask for more.

/**
 * How a radio prayer that would cost tokens is paid instead, if it can be: the
 * member's free prayers this month first, then a granted allowance. Uses up the
 * allowance it returns, so call it inside the queueing transaction.
 */
export async function radioFunding(q: Queryable, userId: string): Promise<'everyone' | 'allowance' | null> {
  const s = await settings(q);
  if (!s.enabled) return null;
  if (s.everyone_monthly > 0) {
    const { rows } = await q.query<{ n: number }>(
      `select count(*)::int as n from public.radio_prayers
        where user_id = $1 and funded_by = 'everyone' and created_at >= date_trunc('month', now())`,
      [userId],
    );
    if (rows[0]!.n < s.everyone_monthly) return 'everyone';
  }
  const { rowCount } = await q.query(
    `update public.radio_allowances set remaining = remaining - 1, updated_at = now() where user_id = $1 and remaining > 0`,
    [userId],
  );
  return rowCount ? 'allowance' : null;
}

export async function allowance(q: Queryable, userId: string) {
  const s = await settings(q);
  const { rows } = await q.query<{ remaining: number }>('select remaining from public.radio_allowances where user_id = $1', [userId]);
  const { rows: used } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.radio_prayers where user_id = $1 and funded_by = 'everyone' and created_at >= date_trunc('month', now())`,
    [userId],
  );
  const { rows: pending } = await q.query<{ count: number }>(`select count from public.radio_allocation_requests where user_id = $1 and status = 'pending'`, [userId]);
  return {
    enabled: s.enabled,
    freeThisMonth: s.enabled ? Math.max(0, s.everyone_monthly - used[0]!.n) : 0,
    granted: rows[0]?.remaining ?? 0,
    canRequest: s.enabled && s.allocation_requests_enabled && !pending[0],
    pendingRequest: pending[0]?.count ?? null,
    maxPerRequest: s.allocation_max_per_request,
  };
}

export const AllocationRequest = z.object({
  count: z.number().int().min(1).max(100),
  note: z.string().trim().max(500).default(''),
});

export async function requestAllocation(q: Queryable, userId: string, input: z.infer<typeof AllocationRequest>) {
  const s = await settings(q);
  if (!s.enabled || !s.allocation_requests_enabled) throw forbidden('Asking for more radio prayers is not turned on');
  if (input.count > s.allocation_max_per_request) throw badRequest(`You can ask for up to ${s.allocation_max_per_request} at a time`);
  try {
    const { rows } = await q.query<{ id: string }>(
      'insert into public.radio_allocation_requests (user_id, count, note) values ($1, $2, $3) returning id',
      [userId, input.count, input.note],
    );
    // Tell the staff who can answer it, so it doesn't wait unseen.
    const { rows: staff } = await q.query<{ user_id: string; name: string }>(
      `select distinct r.user_id, (select coalesce(nullif(display_name, ''), 'A member') from public.profiles where id = $1) as name
         from public.user_roles r where r.role = any(array['admin', 'moderator', 'pastor_counselor']::public.app_role[]) and r.user_id <> $1`,
      [userId],
    );
    for (const r of staff) {
      await notifications.notify(q, r.user_id, {
        kind: 'radio_request',
        title: 'Someone asked for more radio prayers',
        body: `${r.name} asked for ${input.count} more. Open Me → Radio prayer requests to answer.`,
        data: { screen: 'radio-requests' },
      });
    }
    return { id: rows[0]!.id };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('You already have a request waiting');
    throw err;
  }
}

export async function requireStaff(q: Queryable, userId: string) {
  if (!(await hasRole(q, userId, 'admin', 'moderator', 'pastor_counselor'))) throw forbidden('Staff only');
}

export async function pendingRequests(q: Queryable, staffId: string) {
  await requireStaff(q, staffId);
  const { rows } = await q.query(
    `select r.id, r.count, r.note, r.created_at, coalesce(nullif(p.display_name, ''), 'Member') as name,
            (select count(*)::int from public.radio_prayers x where x.user_id = r.user_id and x.created_at > now() - interval '30 days') as sent_last_30_days
       from public.radio_allocation_requests r join public.profiles p on p.id = r.user_id
      where r.status = 'pending' order by r.created_at limit 200`,
  );
  return rows;
}

export const Decision = z.object({ grant: z.number().int().min(0).max(100) });

/** Grant some or all of a request (0 declines it). Granted radio prayers are paid from the shared fund when sent. */
export async function decide(q: Queryable, staffId: string, requestId: string, input: z.infer<typeof Decision>) {
  await requireStaff(q, staffId);
  const { rows } = await q.query<{ user_id: string }>(
    `update public.radio_allocation_requests set status = $3, granted = $2, decided_by = $4, decided_at = now()
      where id = $1 and status = 'pending' and user_id <> $4 returning user_id`,
    [requestId, input.grant, input.grant > 0 ? 'granted' : 'declined', staffId],
  );
  if (!rows[0]) throw notFound('Request');
  await notifications.notify(q, rows[0].user_id, {
    kind: 'radio_request_decided',
    title: input.grant > 0 ? `You have ${input.grant} more free radio ${input.grant === 1 ? 'prayer' : 'prayers'}` : 'Your request for more radio prayers',
    body: input.grant > 0 ? 'Staff granted your request. They are paid from the shared fund.' : 'Staff couldn\'t grant more this time.',
    data: { screen: 'give' },
  });
  if (input.grant > 0) {
    await q.query(
      `insert into public.radio_allowances (user_id, remaining) values ($1, $2)
       on conflict (user_id) do update set remaining = radio_allowances.remaining + excluded.remaining, updated_at = now()`,
      [rows[0].user_id, input.grant],
    );
  }
  return { granted: input.grant };
}
