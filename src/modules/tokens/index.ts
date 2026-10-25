// Tokens module: the only code that moves tokens. Every movement goes through
// public.post_token_transfer() in the database, which is append-only,
// idempotent, and refuses to overdraw a member.
import type { DatabaseError } from 'pg';
import type { Queryable } from '../../db.js';
import { AppError, badRequest } from '../../errors.js';

export type TransferKind = 'earn' | 'gift' | 'spend_reach' | 'resupply' | 'forfeit' | 'clawback';

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

const userAccount = async (q: Queryable, userId: string) =>
  (await q.query<{ id: string }>('select public.token_user_account($1) as id', [userId])).rows[0]!.id;
const postReachAccount = async (q: Queryable, postId: string) =>
  (await q.query<{ id: string }>('select public.token_post_reach_account($1) as id', [postId])).rows[0]!.id;
const systemAccount = async (q: Queryable, kind: 'mint' | 'forfeit') =>
  (await q.query<{ id: string }>('select public.token_system_account($1) as id', [kind])).rows[0]!.id;

export async function balanceOf(q: Queryable, userId: string): Promise<number> {
  const { rows } = await q.query<{ balance: string }>(
    `select balance from public.token_accounts where kind = 'user' and user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function reachOf(q: Queryable, postId: string): Promise<number> {
  const { rows } = await q.query<{ balance: string }>(
    `select balance from public.token_accounts where kind = 'post_reach' and post_id = $1`,
    [postId],
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function earn(q: Queryable, userId: string, amount: number, key: string, reason: string) {
  return transfer(q, key, 'earn', await systemAccount(q, 'mint'), await userAccount(q, userId), amount, null, reason);
}

export async function resupply(q: Queryable, userId: string, amount: number, key: string) {
  return transfer(q, key, 'resupply', await systemAccount(q, 'mint'), await userAccount(q, userId), amount, null, 'weekly resupply');
}

export async function gift(q: Queryable, fromUserId: string, toUserId: string, amount: number, key: string) {
  if (fromUserId === toUserId) throw badRequest('You cannot gift tokens to yourself');
  return transfer(q, `gift:${fromUserId}:${key}`, 'gift', await userAccount(q, fromUserId), await userAccount(q, toUserId), amount, fromUserId, null);
}

export async function spendOnReach(q: Queryable, userId: string, postId: string, amount: number, key: string) {
  return transfer(q, `reach:${userId}:${key}`, 'spend_reach', await userAccount(q, userId), await postReachAccount(q, postId), amount, userId, null);
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
    `select t.id, t.kind, t.amount::int as amount, t.created_at,
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
