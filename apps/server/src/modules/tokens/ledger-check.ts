// Nightly token ledger integrity check. The ledger is double-entry and
// append-only, and balances are a cache kept by post_token_transfer(); this
// re-derives everything from the transfers and alerts every admin when
// anything disagrees. Each check is one statement, so it sees one consistent
// snapshot even while members are praying and gifting.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { notify } from '../notifications/index.js';

export type Problem =
  /** Cached balance differs from credits minus debits. */
  | { check: 'balance_mismatch'; accountId: string; kind: string; currency: string; balance: string; derived: string }
  /** Every transfer debits one account and credits another, so each currency must sum to zero. */
  | { check: 'currency_total'; currency: string; total: string }
  /** Only the mint may go negative. */
  | { check: 'negative_balance'; accountId: string; kind: string; currency: string; balance: string }
  /** A clawback must move the same amount back between the same two accounts. */
  | { check: 'clawback_mismatch'; transferId: string; reverses: string };

export interface LedgerCheck {
  id: string;
  checkedAt: string;
  ok: boolean;
  accountsChecked: number;
  transfersChecked: number;
  problems: Problem[];
  triggeredBy: string | null;
}

const MAX_PROBLEMS = 200;

export async function findProblems(q: Queryable): Promise<{ problems: Problem[]; accounts: number; transfers: number }> {
  const [mismatch, totals, negative, clawbacks, counts] = await Promise.all([
    q.query<{ id: string; kind: string; currency: string; balance: string; derived: string }>(
      `select v.id, v.kind::text, a.currency::text, v.balance::text, v.derived_balance::text as derived
         from public.token_ledger_audit v join public.token_accounts a on a.id = v.id
        order by v.id limit ${MAX_PROBLEMS}`,
    ),
    q.query<{ currency: string; total: string }>(
      `select currency::text, sum(balance)::text as total from public.token_accounts group by currency having sum(balance) <> 0`,
    ),
    q.query<{ id: string; kind: string; currency: string; balance: string }>(
      `select id, kind::text, currency::text, balance::text from public.token_accounts
        where kind <> 'mint' and balance < 0 order by id limit ${MAX_PROBLEMS}`,
    ),
    q.query<{ id: string; reverses: string }>(
      `select c.id, c.reverses_transfer_id as reverses
         from public.token_transfers c join public.token_transfers o on o.id = c.reverses_transfer_id
        where c.kind = 'clawback'
          and (c.amount <> o.amount or c.debit_account_id <> o.credit_account_id or c.credit_account_id <> o.debit_account_id)
        order by c.id limit ${MAX_PROBLEMS}`,
    ),
    q.query<{ accounts: number; transfers: string }>(
      `select (select count(*)::int from public.token_accounts) as accounts, (select count(*) from public.token_transfers)::text as transfers`,
    ),
  ]);
  const problems: Problem[] = [
    ...mismatch.rows.map((r) => ({ check: 'balance_mismatch' as const, accountId: r.id, kind: r.kind, currency: r.currency, balance: r.balance, derived: r.derived })),
    ...totals.rows.map((r) => ({ check: 'currency_total' as const, currency: r.currency, total: r.total })),
    ...negative.rows.map((r) => ({ check: 'negative_balance' as const, accountId: r.id, kind: r.kind, currency: r.currency, balance: r.balance })),
    ...clawbacks.rows.map((r) => ({ check: 'clawback_mismatch' as const, transferId: r.id, reverses: r.reverses })),
  ];
  return { problems, accounts: counts.rows[0]!.accounts, transfers: Number(counts.rows[0]!.transfers) };
}

interface Row {
  id: string;
  checked_at: Date;
  ok: boolean;
  accounts_checked: number;
  transfers_checked: string;
  problems: Problem[];
  triggered_by: string | null;
}
const toCheck = (r: Row): LedgerCheck => ({
  id: r.id,
  checkedAt: r.checked_at.toISOString(),
  ok: r.ok,
  accountsChecked: r.accounts_checked,
  transfersChecked: Number(r.transfers_checked),
  problems: r.problems,
  triggeredBy: r.triggered_by,
});

/** Run the checks, record the run, and alert every admin if anything is wrong. */
export async function runCheck(q: Queryable, triggeredBy: string | null = null): Promise<LedgerCheck> {
  const { problems, accounts, transfers } = await findProblems(q);
  const { rows } = await q.query<Row>(
    `insert into public.token_ledger_checks (ok, accounts_checked, transfers_checked, problems, triggered_by)
     values ($1, $2, $3, $4, $5) returning *`,
    [problems.length === 0, accounts, transfers, JSON.stringify(problems), triggeredBy],
  );
  const check = toCheck(rows[0]!);
  if (!check.ok) {
    const { rows: admins } = await q.query<{ user_id: string }>(`select distinct user_id from public.user_roles where role = 'admin'`);
    for (const a of admins) {
      // ledger_alert is in no notification category, so members can't turn it off.
      await notify(q, a.user_id, {
        kind: 'ledger_alert',
        title: 'Token ledger check found a problem',
        body: `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'} in the token ledger. Open Admin → Tokens for details.`,
        data: { ledgerCheckId: check.id },
        // One alert per admin per day, however many times it runs.
        dedupeKey: `ledger_alert:${check.checkedAt.slice(0, 10)}`,
        t: { key: 'ledger_alert', params: { count: problems.length } },
      });
    }
  }
  return check;
}

export async function recent(q: Queryable, limit = 10): Promise<LedgerCheck[]> {
  const { rows } = await q.query<Row>('select * from public.token_ledger_checks order by checked_at desc limit $1', [limit]);
  return rows.map(toCheck);
}

export function ledgerCheckTask(q: Queryable): Task {
  return async (_payload, helpers) => {
    const c = await runCheck(q);
    if (c.ok) helpers.logger.info(`ledger check: ok (${c.accountsChecked} accounts, ${c.transfersChecked} transfers)`);
    else helpers.logger.error(`ledger check: ${c.problems.length} problems: ${JSON.stringify(c.problems.slice(0, 20))}`);
  };
}
