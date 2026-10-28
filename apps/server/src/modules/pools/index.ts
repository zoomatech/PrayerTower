// Pools module (roadmap Phase 2): donated token pools. A donor funds a pool;
// other members draw a fixed amount from it to extend a request's reach.
// Advertising is banned: no links, and the donor stays anonymous unless they
// choose to be named. The limits are placeholders the donor or admins can change.
import { PRAYER_REALMS } from '@prayer-tower/shared';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as moderation from '../moderation/index.js';
import * as posts from '../posts/index.js';
import * as safety from '../safety/index.js';
import * as tokens from '../tokens/index.js';

const noLinks = (s: string) => !safety.hasLink(s);
const NO_ADS = 'Pools carry no links or ads.';

export const NewPool = z.object({
  name: z.string().trim().min(1).max(60).refine(noLinks, NO_ADS),
  purpose: z.string().trim().max(280).refine(noLinks, NO_ADS).default(''),
  realm: z.enum(PRAYER_REALMS).nullable().default(null),
  drawAmount: z.number().int().min(1).max(1000).default(5),
  drawsPerMemberDay: z.number().int().min(1).max(100).default(1),
  showDonor: z.boolean().default(false),
  amount: z.number().int().min(1).max(1_000_000),
  idempotencyKey: z.string().min(1).max(100),
});

interface PoolRow {
  id: string;
  owner_id: string;
  name: string;
  purpose: string;
  realm: string | null;
  draw_amount: number;
  draws_per_member_day: number;
  show_donor: boolean;
  closed_at: Date | null;
  created_at: Date;
}

const COLS = 'p.id, p.owner_id, p.name, p.purpose, p.realm, p.draw_amount, p.draws_per_member_day, p.show_donor, p.closed_at, p.created_at';

/** What members see: the donor only if they chose to be named. */
async function present(q: Queryable, rows: (PoolRow & { donor: string })[], viewerId: string) {
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      name: r.name,
      purpose: r.purpose,
      realm: r.realm,
      drawAmount: r.draw_amount,
      drawsPerMemberDay: r.draws_per_member_day,
      donor: r.show_donor ? r.donor : null,
      isMine: r.owner_id === viewerId,
      open: r.closed_at === null,
      balance: await tokens.poolBalance(q, r.id),
    })),
  );
}

async function get(q: Queryable, poolId: string, lock = false) {
  const { rows } = await q.query<PoolRow>(`select ${COLS} from public.token_pools p where p.id = $1${lock ? ' for update' : ''}`, [poolId]);
  if (!rows[0]) throw notFound('Pool');
  return rows[0];
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewPool>) {
  const blocked = await safety.newMemberBlock(q, userId, 'start a token pool');
  if (blocked) throw forbidden(blocked);
  const existing = await q.query<{ id: string }>(
    `select p.id from public.token_pools p join public.token_transfers t on t.idempotency_key = $2
      join public.token_accounts a on a.id = t.credit_account_id and a.pool_id = p.id where p.owner_id = $1`,
    [userId, `pool_fund:${userId}:${input.idempotencyKey}`],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.token_pools (owner_id, name, purpose, realm, draw_amount, draws_per_member_day, show_donor)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [userId, input.name, input.purpose, input.realm, input.drawAmount, input.drawsPerMemberDay, input.showDonor],
  );
  await tokens.fundPool(q, userId, rows[0]!.id, input.amount, input.idempotencyKey);
  return rows[0]!.id;
}

export async function fund(q: Queryable, userId: string, poolId: string, amount: number, key: string) {
  const pool = await get(q, poolId, true);
  if (pool.owner_id !== userId) throw forbidden('Only the donor can add to this pool. You can gift tokens to a request instead.');
  if (pool.closed_at) throw conflict('This pool is closed');
  return tokens.fundPool(q, userId, poolId, amount, key);
}

/** The donor, a moderator or an admin closes a pool; what's left goes back to the donor. */
export async function close(q: Queryable, userId: string, poolId: string) {
  const pool = await get(q, poolId, true);
  if (pool.owner_id !== userId && !(await accounts.hasRole(q, userId, 'admin', 'moderator'))) throw forbidden();
  if (pool.closed_at) return;
  await q.query('update public.token_pools set closed_at = now(), closed_by = $2 where id = $1', [poolId, userId]);
  await tokens.returnPool(q, poolId, pool.owner_id, userId);
}

/** Why this member can't draw from this pool for this request, or null. */
async function drawBlock(q: Queryable, userId: string, pool: PoolRow, post: posts.PostRow, balance: number): Promise<string | null> {
  if (pool.closed_at) return 'This pool is closed.';
  if (post.user_id === userId) return 'Pools are for other people\'s requests.';
  if (pool.realm && post.realm !== pool.realm) return 'This pool is for a different kind of request.';
  const { rows } = await q.query<{ for_post: boolean; today: number }>(
    `select bool_or(post_id = $3) as for_post, count(*) filter (where created_at > now() - interval '1 day')::int as today
       from public.token_pool_draws where pool_id = $1 and user_id = $2`,
    [pool.id, userId, post.id],
  );
  if (rows[0]?.for_post) return 'You have already used this pool for this request.';
  if ((rows[0]?.today ?? 0) >= pool.draws_per_member_day) return 'You have used this pool as often as it allows today.';
  if (balance < pool.draw_amount) return 'This pool is empty.';
  return safety.newMemberBlock(q, userId, 'use token pools');
}

/** Open pools, and for a request, whether the member can draw from each. */
export async function list(q: Queryable, viewerId: string, opts: { postId?: string; mine?: boolean } = {}) {
  const { rows } = await q.query<PoolRow & { donor: string }>(
    `select ${COLS}, pr.display_name as donor from public.token_pools p join public.profiles pr on pr.id = p.owner_id
      where case when $2 then p.owner_id = $1 else p.closed_at is null end
      order by p.created_at desc limit 50`,
    [viewerId, !!opts.mine],
  );
  const pools = await present(q, rows, viewerId);
  if (!opts.postId) return pools;
  const post = await posts.getVisible(q, opts.postId);
  if (!post) throw notFound('Post');
  return Promise.all(pools.map(async (p, i) => ({ ...p, blockedReason: await drawBlock(q, viewerId, rows[i]!, post, p.balance) })));
}

export async function draw(q: Queryable, userId: string, poolId: string, postId: string) {
  const pool = await get(q, poolId, true);
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  if (await moderation.awaitingCrisisReview(q, post.id)) {
    throw conflict('This request is waiting for a moderator to check in with the person who posted it. It can be amplified after that.');
  }
  const blocked = await drawBlock(q, userId, pool, post, await tokens.poolBalance(q, pool.id));
  if (blocked) throw conflict(blocked);
  const t = await tokens.drawFromPool(q, userId, pool.id, post.id, pool.draw_amount);
  await q.query('insert into public.token_pool_draws (pool_id, user_id, post_id, transfer_id) values ($1, $2, $3, $4)', [pool.id, userId, post.id, t.id]);
  return { amount: pool.draw_amount, reach: await tokens.reachOf(q, post.id), poolBalance: await tokens.poolBalance(q, pool.id) };
}

