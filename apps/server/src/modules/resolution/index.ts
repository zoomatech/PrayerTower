// Prayer resolution check-ins (Steve, 2026-10-31). Some days after a prayer request, its author
// is asked "Has this prayer been answered?":
//   * Yes: a brief survey, "The Lord answered my prayer in a way I had hoped" (hoped) or "The
//     Lord answered my prayer according to his will, not my will" (his_will). The request is
//     marked answered, and whether it went out by radio is looked up in radio_prayers (this
//     request and any it was reposted from), never asked.
//   * Not yet: they may repost the request as it is or reworded, and may take a free broadcast
//     (Priestly) token. If they do neither, they are asked again later, up to max_asks times.
// Timing and the token offer: Admin → Prayer resolution (resolution_settings).
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export interface ResolutionSettings {
  enabled: boolean;
  first_days: number;
  again_days: number;
  max_asks: number;
  free_tokens: number;
  free_token_every_days: number;
}

const COLS = 'enabled, first_days, again_days, max_asks, free_tokens, free_token_every_days';

export async function settings(q: Queryable): Promise<ResolutionSettings> {
  const { rows } = await q.query<ResolutionSettings>(`select ${COLS} from public.resolution_settings`);
  return rows[0] ?? { enabled: false, first_days: 14, again_days: 30, max_asks: 3, free_tokens: 1, free_token_every_days: 30 };
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  firstDays: z.number().int().min(1).max(365).optional(),
  againDays: z.number().int().min(1).max(365).optional(),
  maxAsks: z.number().int().min(1).max(12).optional(),
  freeTokens: z.number().int().min(0).max(100).optional(),
  freeTokenEveryDays: z.number().int().min(0).max(365).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.resolution_settings set enabled = coalesce($1, enabled), first_days = coalesce($2, first_days),
            again_days = coalesce($3, again_days), max_asks = coalesce($4, max_asks),
            free_tokens = coalesce($5, free_tokens), free_token_every_days = coalesce($6, free_token_every_days)`,
    [p.enabled ?? null, p.firstDays ?? null, p.againDays ?? null, p.maxAsks ?? null, p.freeTokens ?? null, p.freeTokenEveryDays ?? null],
  );
  return settings(q);
}

interface Row {
  post_id: string;
  user_id: string;
  asks: number;
  pending: boolean;
  answered: boolean | null;
  outcome: 'hoped' | 'his_will' | null;
  prayercast: boolean | null;
  reposted_post_id: string | null;
  token_transfer_id: string | null;
}

async function row(q: Queryable, postId: string, lock = false): Promise<Row | null> {
  const { rows } = await q.query<Row>(
    `select post_id, user_id, asks, pending, answered, outcome, prayercast, reposted_post_id, token_transfer_id
       from public.prayer_resolutions where post_id = $1${lock ? ' for update' : ''}`,
    [postId],
  );
  return rows[0] ?? null;
}

/** Free broadcast tokens the member may take on this request now (0 = none). */
async function tokenOffer(q: Queryable, s: ResolutionSettings, r: Row): Promise<number> {
  if (!s.free_tokens || r.answered !== false || r.token_transfer_id) return 0;
  if (s.free_token_every_days > 0) {
    const { rowCount } = await q.query(
      `select 1 from public.prayer_resolutions r join public.token_transfers t on t.id = r.token_transfer_id
        where r.user_id = $1 and t.created_at > now() - make_interval(days => $2)`,
      [r.user_id, s.free_token_every_days],
    );
    if (rowCount) return 0;
  }
  return s.free_tokens;
}

/** The author's check-in on their request, for the post screen. */
export async function status(q: Queryable, userId: string, postId: string) {
  const s = await settings(q);
  const r = await row(q, postId);
  const post = r ? await posts.get(q, postId) : null;
  // Marked answered some other way (the Answered button, a story): nothing left to ask.
  if (!s.enabled || !r || !post || r.user_id !== userId || (post.state === 'answered' && r.answered !== true)) {
    return { enabled: s.enabled, pending: false, answered: null, outcome: null, canRepost: false, freeTokens: 0, tokenClaimed: false, repostedPostId: null };
  }
  return {
    enabled: true,
    pending: r.pending,
    answered: r.answered,
    outcome: r.outcome,
    canRepost: r.answered === false && !r.reposted_post_id,
    freeTokens: await tokenOffer(q, s, r),
    tokenClaimed: !!r.token_transfer_id,
    repostedPostId: r.reposted_post_id,
  };
}

/** The radio prayers sent for this request and any request it was reposted from. */
export async function prayercast(q: Queryable, postId: string) {
  const { rows } = await q.query<{ n: number; first: Date | null }>(
    `with recursive chain(id) as (
       select $1::uuid
       union
       select r.post_id from public.prayer_resolutions r join chain c on r.reposted_post_id = c.id
     )
     select count(*)::int as n, min(transmitted_at) as first
       from public.radio_prayers where post_id in (select id from chain) and status = 'transmitted'`,
    [postId],
  );
  return { count: rows[0]!.n, firstAt: rows[0]!.first };
}

export const Answer = z.discriminatedUnion('answered', [
  z.object({ answered: z.literal(true), outcome: z.enum(['hoped', 'his_will']) }),
  z.object({ answered: z.literal(false) }),
]);

async function requireOwn(q: Queryable, userId: string, postId: string) {
  if (!(await settings(q)).enabled) throw badRequest('Prayer resolution check-ins are switched off');
  const r = await row(q, postId, true);
  if (!r) throw notFound('Check-in');
  if (r.user_id !== userId) throw forbidden('Only the person who posted the request can answer');
  return r;
}

/**
 * The author's answer. Answered: marks the request answered through the caller's
 * `markAnswered` (which tells the pray-ers once) and records the survey answer and the
 * radio lookup. Not yet: asks again after again_days, and opens repost and the token offer.
 */
export async function answer(q: Queryable, userId: string, postId: string, input: z.infer<typeof Answer>, markAnswered: () => Promise<unknown>) {
  const r = await requireOwn(q, userId, postId);
  if (r.answered === true) throw conflict('This request is already answered');
  const post = await posts.get(q, postId);
  if (!post) throw notFound('Post');
  if (input.answered) {
    if (post.state !== 'answered') await markAnswered();
    const cast = await prayercast(q, postId);
    await q.query(
      `update public.prayer_resolutions
          set answered = true, outcome = $2, answered_at = now(), pending = false, next_ask_at = null,
              prayercast = $3, prayercast_count = $4, prayercast_at = $5
        where post_id = $1`,
      [postId, input.outcome, cast.count > 0, cast.count, cast.firstAt],
    );
  } else {
    if (post.state === 'answered') throw conflict('This request is already answered');
    const s = await settings(q);
    await q.query(
      `update public.prayer_resolutions
          set answered = false, not_yet_at = now(), pending = false, next_ask_at = now() + make_interval(days => $2)
        where post_id = $1`,
      [postId, s.again_days],
    );
  }
  return status(q, userId, postId);
}

export const Repost = z.object({ body: z.string().trim().min(1).max(10_000).optional() });

/** After "not yet": post the request again, as it was or in new words. The first stays as it is. */
export async function repost(q: Queryable, userId: string, postId: string, input: z.infer<typeof Repost>) {
  const r = await requireOwn(q, userId, postId);
  if (r.answered !== false) throw badRequest('Answer the check-in first');
  if (r.reposted_post_id) throw conflict('This request was already reposted');
  const old = await posts.get(q, postId);
  if (!old || old.moderation_status !== 'visible') throw notFound('Post');
  const created = await posts.create(
    q,
    userId,
    posts.NewPost.parse({
      postType: old.post_type,
      body: input.body ?? old.body,
      kind: old.kind ?? undefined,
      realm: old.realm ?? undefined,
      urgency: old.urgency,
      background: old.background ?? undefined,
      isAnonymous: old.is_anonymous,
      isSensitive: old.is_sensitive,
      allSupportWelcome: old.all_support_welcome,
    }),
  );
  await q.query('update public.prayer_resolutions set reposted_post_id = $2, next_ask_at = null where post_id = $1', [postId, created.id]);
  return { id: created.id, crisis: created.crisis, harm: created.harm };
}

/** After "not yet": take the free broadcast token(s), once per request and as often as Admin allows. */
export async function claimToken(q: Queryable, userId: string, postId: string) {
  const r = await requireOwn(q, userId, postId);
  const amount = await tokenOffer(q, await settings(q), r);
  if (!amount) throw badRequest('There is no free broadcast token to take');
  const t = await tokens.grantBroadcast(q, userId, amount, `resolution:${postId}`);
  await q.query('update public.prayer_resolutions set token_transfer_id = $2 where post_id = $1', [postId, t.id]);
  return { amount, priestly: await tokens.balanceOf(q, userId, 'priestly') };
}

/**
 * Hourly: ask each author about open requests that are due. A request's first ask comes
 * first_days after it was posted; requests more than 30 days past that are left alone, so
 * switching this on doesn't wake up old requests all at once. A request answered "not yet",
 * or not answered, is asked again after again_days, up to max_asks times in all.
 */
export function dueTask(q: Queryable): Task {
  return async () => {
    const s = await settings(q);
    if (!s.enabled) return;
    await q.query(
      `insert into public.prayer_resolutions (post_id, user_id)
       select p.id, p.user_id from public.posts p
        where p.post_type = 'prayer_request' and p.state <> 'answered' and p.moderation_status = 'visible'
          and p.created_at < now() - make_interval(days => $1)
          and p.created_at > now() - make_interval(days => $1 + 30)
          and not exists (select 1 from public.prayer_resolutions r where r.post_id = p.id)
        order by p.created_at
        limit 500
       on conflict do nothing`,
      [s.first_days],
    );
    const { rows } = await q.query<{ post_id: string; user_id: string; asks: number }>(
      `update public.prayer_resolutions r
          set asks = r.asks + 1, pending = true, asked_at = now(), next_ask_at = now() + make_interval(days => $1)
         from public.posts p
        where p.id = r.post_id and p.state <> 'answered' and p.moderation_status = 'visible'
          and r.answered is not true and r.reposted_post_id is null and r.asks < $2
          and (r.next_ask_at is null or r.next_ask_at <= now())
        returning r.post_id, r.user_id, r.asks`,
      [s.again_days, s.max_asks],
    );
    for (const r of rows) {
      await notifications.notify(q, r.user_id, {
        kind: 'resolution',
        title: 'Has this prayer been answered?',
        body: 'Checking in on your prayer request. Tap to let us know.',
        data: { postId: r.post_id, resolution: true },
        dedupeKey: `resolution:${r.post_id}:${r.asks}`,
        t: { key: 'resolution' },
      });
    }
  };
}

/** Admin: totals, and each answered request with whether it went out by radio. */
export async function report(q: Queryable, limit = 50) {
  const { rows: t } = await q.query<Record<string, number>>(
    `select count(*) filter (where asks > 0)::int as asked,
            count(*) filter (where answered)::int as answered,
            count(*) filter (where outcome = 'hoped')::int as hoped,
            count(*) filter (where outcome = 'his_will')::int as his_will,
            count(*) filter (where answered = false)::int as not_yet,
            count(*) filter (where answered and prayercast)::int as answered_prayercast,
            count(*) filter (where reposted_post_id is not null)::int as reposted,
            count(*) filter (where token_transfer_id is not null)::int as free_tokens
       from public.prayer_resolutions`,
  );
  const { rows } = await q.query<{
    post_id: string; who: string | null; outcome: 'hoped' | 'his_will'; prayercast: boolean; prayercast_count: number; prayercast_at: Date | null; answered_at: Date;
  }>(
    `select r.post_id, pr.display_name as who, r.outcome, coalesce(r.prayercast, false) as prayercast,
            coalesce(r.prayercast_count, 0) as prayercast_count, r.prayercast_at, r.answered_at
       from public.prayer_resolutions r left join public.profiles pr on pr.id = r.user_id
      where r.answered
      order by r.answered_at desc
      limit $1`,
    [limit],
  );
  return {
    totals: t[0]!,
    answered: rows.map((r) => ({
      postId: r.post_id,
      who: r.who,
      outcome: r.outcome,
      prayercast: r.prayercast,
      prayercastCount: r.prayercast_count,
      prayercastAt: r.prayercast_at?.toISOString() ?? null,
      answeredAt: r.answered_at.toISOString(),
    })),
  };
}
