// Tokens module: the only code that moves tokens. Every movement goes through
// public.post_token_transfer() in the database, which is append-only,
// idempotent, and refuses to overdraw a member.
import type { DatabaseError } from 'pg';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, notFound } from '../../errors.js';

export type TransferKind = 'earn' | 'gift' | 'spend_reach' | 'resupply' | 'forfeit' | 'clawback' | 'donate' | 'bonus' | 'spend_radio' | 'pool_fund' | 'pool_draw' | 'pool_return' | 'purchase';
/** Regular tokens are earned per prayer; Priestly tokens per N verified prayers and fund the infrastructure. */
export type Currency = 'regular' | 'priestly';

export interface Transfer {
  id: string;
  idempotency_key: string;
  kind: TransferKind;
  debit_account_id: string;
  credit_account_id: string;
  amount: string;
  reverses_transfer_id: string | null;
  created_at: Date;
}

function mapLedgerError(err: unknown): never {
  const code = (err as DatabaseError).code;
  if (code === '23514') throw new AppError(409, 'insufficient_tokens', 'Not enough tokens');
  if (code === 'P0002') throw new AppError(409, 'idempotency_conflict', 'Idempotency key reused with different details');
  if (code === 'P0003') throw new AppError(404, 'not_found', 'Transfer not found');
  if (code === 'P0004') throw badRequest('A clawback cannot be clawed back');
  if (code === '23505') throw new AppError(409, 'already_reversed', 'Transfer was already clawed back');
  if (code === 'P0005') throw badRequest('A transfer cannot mix token kinds');
  throw err;
}

async function transfer(
  q: Queryable,
  key: string,
  kind: TransferKind,
  debit: string,
  credit: string,
  amount: number,
  actorId: string | null,
  reason: string | null,
): Promise<Transfer> {
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('Amount must be a positive whole number');
  try {
    const { rows } = await q.query<Transfer>(
      'select * from public.post_token_transfer($1, $2, $3, $4, $5, $6, $7)',
      [key, kind, debit, credit, amount, actorId, reason],
    );
    return rows[0]!;
  } catch (err) {
    mapLedgerError(err);
  }
}

const userAccount = async (q: Queryable, userId: string, currency: Currency = 'regular') =>
  (await q.query<{ id: string }>('select public.token_user_account($1, $2) as id', [userId, currency])).rows[0]!.id;
const postReachAccount = async (q: Queryable, postId: string) =>
  (await q.query<{ id: string }>('select public.token_post_reach_account($1) as id', [postId])).rows[0]!.id;
const poolAccount = async (q: Queryable, poolId: string) =>
  (await q.query<{ id: string }>('select public.token_pool_account($1) as id', [poolId])).rows[0]!.id;
const systemAccount = async (q: Queryable, kind: 'mint' | 'forfeit' | 'infrastructure', currency: Currency = 'regular') =>
  (await q.query<{ id: string }>('select public.token_system_account($1, $2) as id', [kind, currency])).rows[0]!.id;

export async function balanceOf(q: Queryable, userId: string, currency: Currency = 'regular'): Promise<number> {
  const { rows } = await q.query<{ balance: string }>(
    `select balance from public.token_accounts where kind = 'user' and user_id = $1 and currency = $2`,
    [userId, currency],
  );
  return Number(rows[0]?.balance ?? 0);
}

/** Reach for many posts in one query (feed cards); posts without an account have 0. */
export async function reachOfMany(q: Queryable, postIds: string[]): Promise<Map<string, number>> {
  const { rows } = await q.query<{ post_id: string; balance: string }>(
    `select post_id, balance from public.token_accounts where kind = 'post_reach' and post_id = any($1::uuid[])`,
    [postIds],
  );
  return new Map(rows.map((r) => [r.post_id, Number(r.balance)]));
}

export async function reachOf(q: Queryable, postId: string): Promise<number> {
  const { rows } = await q.query<{ balance: string }>(
    `select balance from public.token_accounts where kind = 'post_reach' and post_id = $1`,
    [postId],
  );
  return Number(rows[0]?.balance ?? 0);
}

/** Tokens bought in the store (key: one per store transaction, so a retry never credits twice). */
export async function creditPurchase(q: Queryable, userId: string, amount: number, key: string, currency: Currency = 'regular') {
  return transfer(q, key, 'purchase', await systemAccount(q, 'mint', currency), await userAccount(q, userId, currency), amount, userId, 'Token purchase');
}

/** A paid gift to everyone: new Priestly tokens into the shared radio fund. */
export async function creditFund(q: Queryable, amount: number, key: string, reason: string) {
  return transfer(q, key, 'purchase', await systemAccount(q, 'mint', 'priestly'), await systemAccount(q, 'infrastructure', 'priestly'), amount, null, reason);
}

/** A paid gift to a pool: new regular tokens into the pool. */
export async function creditPool(q: Queryable, poolId: string, amount: number, key: string, reason: string) {
  return transfer(q, key, 'purchase', await systemAccount(q, 'mint'), await poolAccount(q, poolId), amount, null, reason);
}

export async function earn(q: Queryable, userId: string, amount: number, key: string, reason: string) {
  return transfer(q, key, 'earn', await systemAccount(q, 'mint'), await userAccount(q, userId), amount, null, reason);
}

export async function resupply(q: Queryable, userId: string, amount: number, key: string) {
  return transfer(q, key, 'resupply', await systemAccount(q, 'mint'), await userAccount(q, userId), amount, null, 'weekly resupply');
}

export async function gift(q: Queryable, fromUserId: string, toUserId: string, amount: number, key: string, currency: Currency = 'regular') {
  if (fromUserId === toUserId) throw badRequest('You cannot gift tokens to yourself');
  // Only to a current member, and never across a block (either way): the tokens would be lost, or
  // reach someone who chose not to hear from the giver. Same answer for all three, like /people/:id.
  const { rowCount } = await q.query(
    `select 1 from public.profiles p where p.id = $2 and p.deleted_at is null
        and not exists (select 1 from public.user_blocks b
                         where (b.user_id = $1 and b.blocked_id = $2) or (b.user_id = $2 and b.blocked_id = $1))`,
    [fromUserId, toUserId],
  );
  if (!rowCount) throw notFound('Person');
  return transfer(
    q, `gift:${fromUserId}:${key}`, 'gift',
    await userAccount(q, fromUserId, currency), await userAccount(q, toUserId, currency), amount, fromUserId, null,
  );
}

/** Donate Priestly tokens to the fund that runs the intercessory infrastructure. */
export async function donatePriestly(q: Queryable, userId: string, amount: number, key: string) {
  return transfer(
    q, `donate:${userId}:${key}`, 'donate',
    await userAccount(q, userId, 'priestly'), await systemAccount(q, 'infrastructure', 'priestly'), amount, userId, null,
  );
}

/** Donate tokens of either currency to the infrastructure fund (an award winner giving away their prize). */
export async function donate(q: Queryable, userId: string, amount: number, key: string, currency: Currency) {
  return transfer(
    q, `donate:${userId}:${key}`, 'donate',
    await userAccount(q, userId, currency), await systemAccount(q, 'infrastructure', currency), amount, userId, 'Award prize donated',
  );
}

/** Spend Priestly tokens on a radio prayer; they go to the infrastructure fund. */
export async function spendOnRadio(q: Queryable, userId: string, amount: number, key: string) {
  return transfer(
    q, `radio:${userId}:${key}`, 'spend_radio',
    await userAccount(q, userId, 'priestly'), await systemAccount(q, 'infrastructure', 'priestly'), amount, userId, 'Radio prayer',
  );
}

/** Count a verified prayer toward Priestly tokens; returns tokens credited (usually 0). Idempotent per event. */
export async function creditPriestlyProgress(q: Queryable, eventId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>('select public.credit_priestly_progress($1) as n', [eventId]);
  return rows[0]!.n;
}

/**
 * Milestone bonuses (not decided yet). The hook: credit `amount` of `currency`
 * once per member per milestone key, e.g. 'first_100_prayers'.
 */
export async function awardBonus(q: Queryable, userId: string, milestone: string, amount: number, currency: Currency = 'regular') {
  return transfer(
    q, `bonus:${milestone}:${userId}`, 'bonus',
    await systemAccount(q, 'mint', currency), await userAccount(q, userId, currency), amount, null, `Milestone: ${milestone}`,
  );
}

export interface TokenSettings {
  priestly_prayers_per_token: number;
  verified_prayer_min_gap_seconds: number;
  radio_prayer_cost: number;
  /** 'tokens': radio prayers spend Priestly tokens. 'free': they cost nothing; Priestly tokens are donations only. */
  radio_funding: 'tokens' | 'free';
  /** Verified prayers that count toward Priestly tokens per member per UTC day (0 = no cap). */
  verified_prayers_per_day: number;
  /** Priestly tokens for one Amplify while radio prayers cost tokens; null = paid Amplify off. */
  amplify_paid_cost: number | null;
}

export async function settings(q: Queryable): Promise<TokenSettings> {
  const { rows } = await q.query<TokenSettings>(
    'select priestly_prayers_per_token, verified_prayer_min_gap_seconds, radio_prayer_cost, radio_funding, verified_prayers_per_day, amplify_paid_cost from public.token_settings',
  );
  return rows[0]!;
}

export async function updateSettings(q: Queryable, patch: Partial<TokenSettings>): Promise<TokenSettings> {
  const { rows } = await q.query<TokenSettings>(
    `update public.token_settings
        set priestly_prayers_per_token = coalesce($1, priestly_prayers_per_token),
            verified_prayer_min_gap_seconds = coalesce($2, verified_prayer_min_gap_seconds),
            radio_prayer_cost = coalesce($3, radio_prayer_cost),
            radio_funding = coalesce($4, radio_funding),
            verified_prayers_per_day = coalesce($5, verified_prayers_per_day),
            amplify_paid_cost = case when $6 then $7::int else amplify_paid_cost end
      returning priestly_prayers_per_token, verified_prayer_min_gap_seconds, radio_prayer_cost, radio_funding, verified_prayers_per_day, amplify_paid_cost`,
    [
      patch.priestly_prayers_per_token ?? null, patch.verified_prayer_min_gap_seconds ?? null, patch.radio_prayer_cost ?? null, patch.radio_funding ?? null,
      patch.verified_prayers_per_day ?? null, patch.amplify_paid_cost !== undefined, patch.amplify_paid_cost ?? null,
    ],
  );
  return rows[0]!;
}

/** A member's Priestly balance and progress toward the next one. */
export async function priestlyStatus(q: Queryable, userId: string) {
  const [balance, s, { rows }] = await Promise.all([
    balanceOf(q, userId, 'priestly'),
    settings(q),
    q.query<{ verified_pending: number; verified_total: number }>(
      'select verified_pending, verified_total from public.priestly_progress where user_id = $1',
      [userId],
    ),
  ]);
  return {
    balance,
    verifiedPrayers: rows[0]?.verified_total ?? 0,
    towardNext: rows[0]?.verified_pending ?? 0,
    prayersPerToken: s.priestly_prayers_per_token,
    radioPrayerCost: s.radio_funding === 'free' ? 0 : s.radio_prayer_cost,
    /** Amplify (send several times): free while radio prayers are free, else at amplifyCost when an admin set one; null when unavailable. */
    amplifyRepeats:
      s.radio_funding === 'free' || s.amplify_paid_cost !== null
        ? (await q.query<{ n: number }>('select radio_amplify_repeats as n from public.token_settings')).rows[0]!.n
        : null,
    amplifyCost: s.radio_funding === 'free' ? 0 : s.amplify_paid_cost,
  };
}

export async function spendOnReach(q: Queryable, userId: string, postId: string, amount: number, key: string) {
  return transfer(q, `reach:${userId}:${key}`, 'spend_reach', await userAccount(q, userId), await postReachAccount(q, postId), amount, userId, null);
}

export async function poolBalance(q: Queryable, poolId: string): Promise<number> {
  const { rows } = await q.query<{ balance: string }>(`select balance from public.token_accounts where kind = 'pool' and pool_id = $1`, [poolId]);
  return Number(rows[0]?.balance ?? 0);
}

/** A donor puts tokens into their pool. */
export async function fundPool(q: Queryable, userId: string, poolId: string, amount: number, key: string) {
  return transfer(q, `pool_fund:${userId}:${key}`, 'pool_fund', await userAccount(q, userId), await poolAccount(q, poolId), amount, userId, null);
}

/** A member gives to someone else's matching pool; `key` is the member's own idempotency key. */
export async function giveToPool(q: Queryable, userId: string, poolId: string, amount: number, key: string) {
  return transfer(q, `pool_give:${poolId}:${userId}:${key}`, 'pool_fund', await userAccount(q, userId), await poolAccount(q, poolId), amount, userId, null);
}

/** The donor's match for one gift, keyed to that gift so a retry never matches twice. */
export async function matchPoolGift(q: Queryable, ownerId: string, poolId: string, amount: number, giftId: string) {
  return transfer(q, `pool_match:${giftId}`, 'pool_fund', await userAccount(q, ownerId), await poolAccount(q, poolId), amount, ownerId, 'Matching pledge');
}

/** A member draws from a pool to extend a request's reach. Refused (409) when the pool runs short. */
export async function drawFromPool(q: Queryable, userId: string, poolId: string, postId: string, amount: number) {
  return transfer(q, `pool_draw:${poolId}:${userId}:${postId}`, 'pool_draw', await poolAccount(q, poolId), await postReachAccount(q, postId), amount, userId, null);
}

/**
 * A closed pool's remaining tokens go back to the people who put them in. Members who
 * gave to a matching pool get their share of what is left (rounded down, by what each
 * put in); the donor gets the rest.
 */
/** What each member other than the owner has given to a pool, in total. */
export async function poolGivers(q: Queryable, poolId: string, ownerId: string) {
  const { rows } = await q.query<{ user_id: string; given: number }>(
    `select a.user_id, sum(t.amount)::float8 as given
       from public.token_transfers t join public.token_accounts a on a.id = t.debit_account_id
      where t.credit_account_id = $1 and t.kind = 'pool_fund' and a.user_id <> $2
      group by a.user_id`,
    [await poolAccount(q, poolId), ownerId],
  );
  return rows;
}

export async function returnPool(q: Queryable, poolId: string, ownerId: string, actorId: string) {
  const left = await poolBalance(q, poolId);
  if (left <= 0) return null;
  const pool = await poolAccount(q, poolId);
  const { rows } = await q.query<{ user_id: string; given: number; total: number }>(
    `with ins as (
       select a.user_id, t.amount from public.token_transfers t join public.token_accounts a on a.id = t.debit_account_id
        where t.credit_account_id = $1 and t.kind = 'pool_fund')
     select user_id, sum(amount)::float8 as given, (select sum(amount) from ins)::float8 as total
       from ins where user_id <> $2 group by user_id order by user_id`,
    [pool, ownerId],
  );
  let rest = left;
  for (const r of rows) {
    const share = Math.floor((left * r.given) / r.total);
    if (share <= 0) continue;
    await transfer(q, `pool_return:${poolId}:${r.user_id}`, 'pool_return', pool, await userAccount(q, r.user_id), share, actorId, 'Pool closed: your share');
    rest -= share;
  }
  if (rest <= 0) return null;
  return transfer(q, `pool_return:${poolId}`, 'pool_return', pool, await userAccount(q, ownerId), rest, actorId, 'Pool closed');
}

/** Moderation penalty: move up to `amount` (or everything) from a member to the forfeit sink. */
export async function forfeit(q: Queryable, userId: string, amount: number | 'all', moderatorId: string, key: string, reason: string) {
  const account = await userAccount(q, userId);
  const available = await balanceOf(q, userId);
  const take = amount === 'all' ? available : Math.min(amount, available);
  if (take <= 0) return null;
  return transfer(q, key, 'forfeit', account, await systemAccount(q, 'forfeit'), take, moderatorId, reason);
}

export async function clawback(q: Queryable, transferId: string, moderatorId: string, reason: string): Promise<Transfer> {
  try {
    const { rows } = await q.query<Transfer>('select * from public.clawback_token_transfer($1, $2, $3)', [transferId, moderatorId, reason]);
    return rows[0]!;
  } catch (err) {
    mapLedgerError(err);
  }
}

export async function history(q: Queryable, userId: string, limit = 50) {
  const { rows } = await q.query(
    `select t.id, t.kind, a.currency, t.amount::int as amount, t.created_at,
            case when t.credit_account_id = a.id then 'in' else 'out' end as direction
       from public.token_accounts a
       join public.token_transfers t on a.id in (t.credit_account_id, t.debit_account_id)
      where a.kind = 'user' and a.user_id = $1
      order by t.id desc
      limit $2`,
    [userId, limit],
  );
  return rows;
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select coalesce(sum(t.amount) filter (where t.kind = 'earn' and a.currency = 'regular'), 0)::int as earned,
            coalesce(sum(t.amount) filter (where t.kind = 'earn' and a.currency = 'priestly'), 0)::int as priestly_earned,
            coalesce(sum(t.amount) filter (where t.kind = 'donate'), 0)::int as priestly_donated,
            coalesce(sum(t.amount) filter (where t.kind = 'spend_radio'), 0)::int as priestly_spent_on_radio,
            coalesce(sum(t.amount) filter (where t.kind = 'resupply'), 0)::int as resupplied,
            coalesce(sum(t.amount) filter (where t.kind = 'gift'), 0)::int as gifted,
            coalesce(sum(t.amount) filter (where t.kind = 'spend_reach'), 0)::int as spent_on_reach,
            coalesce(sum(t.amount) filter (where t.kind = 'pool_fund'), 0)::int as pooled,
            coalesce(sum(t.amount) filter (where t.kind = 'pool_draw'), 0)::int as drawn_from_pools,
            coalesce(sum(t.amount) filter (where t.kind in ('forfeit', 'clawback')), 0)::int as forfeited_or_clawed_back
       from public.token_transfers t join public.token_accounts a on a.id = t.credit_account_id
      where t.created_at >= $1`,
    [since],
  );
  return rows[0];
}
