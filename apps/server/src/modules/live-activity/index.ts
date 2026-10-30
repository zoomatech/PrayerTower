// "Praying for you now" Live Activity (migration 20261029062200_prayed_for_live.sql,
// docs/GROWTH.md): a member puts one of their own open requests on their Lock Screen
// for up to 8 hours, and it updates as people pray. The Lock Screen is seen by others,
// so it carries first names and a count only, never the request's words, and never
// anyone who prayed anonymously. Updates go out only while the switch is on and the
// server has an Apple push key.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as growth from '../growth/index.js';
import * as posts from '../posts/index.js';
import type { ApnsSend } from './apns.js';

/** Apple ends a Live Activity after 8 hours; so do we. */
export const MAX_HOURS = 8;
/** At most this many open activities per member. */
const MAX_OPEN = 3;

export const Start = z.object({
  postId: z.uuid(),
  pushToken: z.string().regex(/^[0-9a-f]{16,400}$/i),
  appId: z.string().regex(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){1,6}$/).max(100),
});

/** The content the activity shows; the app starts it with the same shape. */
export interface LiveProps {
  heading: string;
  line: string;
  count: number;
}

export interface Summary {
  people: number;
  /** First names, newest first, at most two. */
  names: string[];
}

/** Who prayed for this request since the activity started: members (named unless anonymous) and guests. */
export async function summary(q: Queryable, postId: string, since: Date): Promise<Summary> {
  const { rows: members } = await q.query<{ name: string | null; anonymous: boolean; at: Date }>(
    // Someone the author blocked after they prayed still counts, but their name never shows on the Lock Screen.
    `select distinct on (e.user_id) pr.display_name as name,
            e.is_anonymous or exists (select 1 from public.user_blocks b where b.user_id = p.user_id and b.blocked_id = e.user_id) as anonymous, e.created_at as at
       from public.prayer_events e
       join public.posts p on p.id = e.post_id
       join public.profiles pr on pr.id = e.user_id
      where e.post_id = $1 and e.user_id <> p.user_id and e.created_at >= $2
      order by e.user_id, e.created_at desc`,
    [postId, since],
  );
  const { rows: guests } = await q.query<{ name: string | null; at: Date }>(
    'select first_name as name, created_at as at from public.guest_prayers where post_id = $1 and created_at >= $2',
    [postId, since],
  );
  const named = [...members.filter((m) => !m.anonymous), ...guests]
    .map((x) => ({ name: growth.firstName(x.name), at: x.at }))
    .filter((x): x is { name: string; at: Date } => !!x.name)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return { people: members.length + guests.length, names: [...new Set(named.map((x) => x.name))].slice(0, 2) };
}

/** The Lock Screen words. Open Circle's carry no religious word. */
export function props(s: Summary, secular: boolean): LiveProps {
  const verb = secular ? 'sent support' : 'prayed for you';
  const [a, b] = s.names;
  let line: string;
  if (s.people === 0) line = secular ? 'Waiting for the first kind word' : 'Waiting for the first prayer';
  else if (!a) line = `${s.people} ${s.people === 1 ? 'person' : 'people'} ${verb}`;
  else if (s.people === 1) line = `${a} ${verb}`;
  else if (s.people === 2 && b) line = `${a} and ${b} ${verb}`;
  else line = `${a} and ${s.people - 1} ${s.people === 2 ? 'other' : 'others'} ${verb}`;
  return { heading: secular ? 'Thinking of you' : 'Praying for you', line, count: s.people };
}

/** The member's own visible, open prayer request. */
async function ownOpenRequest(q: Queryable, userId: string, postId: string) {
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the person who asked can follow this request on their Lock Screen');
  posts.requirePrayable(post);
  if (post.state === 'answered') throw badRequest('This request is already answered');
  return post;
}

/** The app started an activity for this request: keep its push token so the worker can update it. */
export async function start(q: Queryable, userId: string, input: z.infer<typeof Start>) {
  if (!(await growth.settings(q)).prayed_for_live_enabled) throw forbidden('This is turned off for now');
  const post = await ownOpenRequest(q, userId, input.postId);
  const token = input.pushToken.toLowerCase();
  // One activity per request; the newest wins. And never more than MAX_OPEN in all.
  await q.query('update public.live_activities set ended_at = now() where post_id = $1 and ended_at is null and push_token <> $2', [post.id, token]);
  await q.query(
    `update public.live_activities set ended_at = now()
      where id in (select id from public.live_activities where user_id = $1 and ended_at is null order by created_at desc offset $2)`,
    [userId, MAX_OPEN - 1],
  );
  const { rows } = await q.query<{ id: string; created_at: Date }>(
    `insert into public.live_activities (user_id, post_id, push_token, app_id) values ($1, $2, $3, $4)
     on conflict (push_token) do update set ended_at = null where live_activities.user_id = excluded.user_id
     returning id, created_at`,
    [userId, post.id, token, input.appId],
  );
  if (!rows[0]) throw forbidden('That activity belongs to someone else');
  const s = await summary(q, post.id, rows[0].created_at);
  await q.query('update public.live_activities set last_people = $2 where id = $1', [rows[0].id, s.people]);
  return { id: rows[0].id, props: props(s, await growth.secularCommunity(q, post.community_id)) };
}

/** The member ended the activity (or the app saw it end). */
export async function end(q: Queryable, userId: string, pushToken: string) {
  await q.query('update public.live_activities set ended_at = now() where user_id = $1 and push_token = $2 and ended_at is null', [userId, pushToken.toLowerCase()]);
}

const GONE = new Set(['BadDeviceToken', 'ExpiredToken', 'Unregistered', 'DeviceTokenNotForTopic', 'TopicDisallowed']);

/**
 * Every minute: send Apple an update for each open activity whose count changed, and end
 * the ones past 8 hours or whose request was answered or hidden. Without a push key, or
 * with the switch off, it only ends what is due.
 */
export async function refresh(q: Queryable, send: ApnsSend | null, now = new Date()) {
  const on = (await growth.settings(q)).prayed_for_live_enabled;
  const { rows } = await q.query<{ id: string; post_id: string; push_token: string; app_id: string; last_people: number; created_at: Date; done: boolean; community_id: string }>(
    `select a.id, a.post_id, a.push_token, a.app_id, a.last_people, a.created_at, p.community_id,
            (a.created_at < $1::timestamptz - make_interval(hours => $2) or p.state = 'answered' or p.moderation_status <> 'visible') as done
       from public.live_activities a join public.posts p on p.id = a.post_id
      where a.ended_at is null`,
    [now, MAX_HOURS],
  );
  // Ended activities are kept a day, then forgotten.
  await q.query("delete from public.live_activities where ended_at < $1::timestamptz - interval '1 day'", [now]);
  let sent = 0;
  for (const a of rows) {
    const s = await summary(q, a.post_id, a.created_at);
    const changed = s.people !== a.last_people;
    if (!a.done && (!changed || !on || !send)) continue;
    if (a.done || !on) {
      await q.query('update public.live_activities set ended_at = now() where id = $1', [a.id]);
      if (!send) continue;
    }
    const event = a.done || !on ? 'end' : 'update';
    const content = props(s, await growth.secularCommunity(q, a.community_id));
    const aps: Record<string, unknown> = {
      timestamp: Math.floor(now.getTime() / 1000),
      event,
      'content-state': { name: 'PrayedFor', props: JSON.stringify(content) },
    };
    if (event === 'end') aps['dismissal-date'] = Math.floor(now.getTime() / 1000) + 15 * 60;
    try {
      const r = await send!(a.push_token, `${a.app_id}.push-type.liveactivity`, { aps }, { 'apns-push-type': 'liveactivity', 'apns-priority': '5' });
      sent += 1;
      if (r.status === 410 || (r.reason && GONE.has(r.reason))) await q.query('update public.live_activities set ended_at = now() where id = $1', [a.id]);
      else if (r.status === 200) await q.query('update public.live_activities set last_people = $2 where id = $1', [a.id, s.people]);
    } catch {
      // Apple unreachable: try again next minute.
    }
  }
  return { checked: rows.length, sent };
}

export function refreshTask(db: Queryable, send: ApnsSend | null): Task {
  return async () => {
    await refresh(db, send);
  };
}
