// Auto-Pray AI intercession (founding pitch: "opt-in Auto Pray"; docs/AUTO_PRAY.md).
// Off by default. A request's author opts in, and an AI writes a short prayer for
// the request on a schedule. AI prayers are labeled as AI, counted on their own,
// and never add to human prayer counts, tokens, tiers, streaks or the radio.
// Only the request's text is sent to the AI, never a name.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import * as posts from '../posts/index.js';
import { mentionsCrisis } from '../safety/index.js';
import { settings } from './index.js';
import * as practice from '../practice-mode/index.js';
import type { Converse } from './provider.js';

export const AUTO_PRAY_SYSTEM = `You write one short Christian intercessory prayer for a prayer request posted in Prayer Tower, a prayer community. The app shows it labeled as written by an AI.

Rules you never break:
- Pray for the person and the need they describe, in two to four sentences, addressed to God, in plain English.
- Never promise an outcome, healing, or answer, and never claim to speak for God.
- Never give medical, legal or money advice, and never judge the person.
- Don't invent names or details that are not in the request.
- Write only the prayer: no title, no notes.`;

/** Requests in a faith-worded community only: Open Circle never offers AI prayers. */
async function faithWorded(q: Queryable, communityId: string) {
  const { rows } = await q.query<{ wording: string }>(
    `select coalesce(vocabulary ->> 'wording', case when tradition = 'secular' then 'neutral' else 'faith' end) as wording from public.communities where id = $1`,
    [communityId],
  );
  return rows[0]?.wording === 'faith';
}

function eligible(post: posts.PostRow) {
  return post.post_type === 'prayer_request' && post.state !== 'answered' && !post.harm_category;
}

/** What a viewer sees under a request: the AI prayers, kept apart from human prayers. */
export async function info(q: Queryable, userId: string, postId: string) {
  const post = await posts.getViewable(q, userId, postId);
  if (!post) throw notFound('Post');
  const s = await settings(q);
  const offered = s.auto_pray_enabled && eligible(post) && (await faithWorded(q, post.community_id));
  if (!offered) return { enabled: false, optedIn: false, until: null, count: 0, prayers: [] };
  const { rows: opt } = await q.query<{ until: Date }>(
    `select created_at + make_interval(days => $2) as until from public.auto_pray_requests where post_id = $1`,
    [postId, s.auto_pray_days],
  );
  const { rows: count } = await q.query<{ n: number }>('select count(*)::int as n from public.ai_prayers where post_id = $1', [postId]);
  const { rows: prayers } = await q.query(
    `select id, body, created_at as "createdAt" from public.ai_prayers where post_id = $1 order by created_at desc limit 3`,
    [postId],
  );
  return { enabled: true, optedIn: !!opt[0], until: opt[0]?.until ?? null, count: count[0]!.n, prayers, isMine: post.user_id === userId };
}

/** Only the request's author turns Auto-Pray on or off. Turning it on again restarts the days. */
export async function setOptIn(q: Queryable, userId: string, postId: string, on: boolean) {
  const post = await posts.getViewable(q, userId, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the person who asked can turn on AI prayers');
  if (on) {
    const s = await settings(q);
    if (!s.auto_pray_enabled || !eligible(post) || !(await faithWorded(q, post.community_id))) throw forbidden('AI prayers are not available for this post');
    await q.query(
      `insert into public.auto_pray_requests (post_id) values ($1) on conflict (post_id) do update set created_at = now()`,
      [postId],
    );
  } else {
    await q.query('delete from public.auto_pray_requests where post_id = $1', [postId]);
  }
  return info(q, userId, postId);
}

/**
 * Writes the AI prayers that are due: each opted-in request gets up to per_day a day,
 * spread out, under the app-wide daily limit. Without an AI connected it does nothing.
 */
export async function writeDue(q: Queryable, real: Converse | null): Promise<number> {
  const s = await settings(q);
  const converse = await practice.converser(q, real);
  if (!s.auto_pray_enabled || !converse) return 0;
  const { rows: today } = await q.query<{ n: number }>(`select count(*)::int as n from public.ai_prayers where created_at > now() - interval '1 day'`);
  let left = s.auto_pray_daily_limit - today[0]!.n;
  if (left <= 0) return 0;
  // Oldest-served first, and only once the spacing (a day / per_day) has passed.
  const { rows: due } = await q.query<{ post_id: string }>(
    `select a.post_id from public.auto_pray_requests a
      where a.created_at > now() - make_interval(days => $1)
        and not exists (select 1 from public.ai_prayers p where p.post_id = a.post_id
                         and p.created_at > now() - make_interval(secs => 86400.0 / $2))
      order by (select max(created_at) from public.ai_prayers p where p.post_id = a.post_id) asc nulls first
      limit $3`,
    [s.auto_pray_days, s.auto_pray_per_day, left],
  );
  let written = 0;
  for (const { post_id } of due) {
    if (left <= 0) break;
    const post = await posts.getVisible(q, post_id);
    // A request in crisis goes to people, never to an AI.
    if (!post || !eligible(post) || mentionsCrisis(post.body) || !(await faithWorded(q, post.community_id))) continue;
    const res = await converse(AUTO_PRAY_SYSTEM, [{ role: 'user', content: `Prayer request:\n${post.body.slice(0, 2000)}` }]);
    if ('refused' in res) continue;
    await q.query('insert into public.ai_prayers (post_id, body) values ($1, $2)', [post_id, res.text.slice(0, 2000)]);
    written++;
    left--;
  }
  return written;
}

export function writeDueTask(q: Queryable, converse: Converse | null): Task {
  return async (_payload, helpers) => {
    const n = await writeDue(q, converse);
    if (n) helpers.logger.info(`auto-pray: wrote ${n} AI prayer(s)`);
  };
}
