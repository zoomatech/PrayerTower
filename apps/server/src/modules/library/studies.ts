// Circle study rooms (docs/LIBRARY_SEARCH.md): a prayer circle picks a passage, or a day of a reading plan, and
// talks it over. A study is a circle post carrying the passage, so everything circles already do applies: only
// members see it, the kind cloud sits on every composer, blocked people's words are left out, and the author or
// the circle's starter can take a study or a reply down (a person decides, never the app). Replies may answer
// one another one level deep. Off by default; needs text search and prayer circles on. Studies of a collection
// the viewer's community isn't offered (the Bible, in Open Circle) are left out for them.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as circles from '../prayer-circles/index.js';
import { settings as practiceSettings } from '../practices/index.js';
import { byKey, citation, collection, COLLECTIONS, features, offered, type CollectionId } from './index.js';
import * as plans from './plans.js';

async function allowed(q: Queryable, userId: string) {
  if (!(await features(q)).libraryStudies) throw forbidden('Study rooms are off');
  if (!(await practiceSettings(q)).prayer_circles_enabled) throw forbidden('Prayer circles are off');
  const ids = await offered(q, userId);
  if (!ids) throw forbidden('Library search is off');
  return ids;
}

async function memberOf(q: Queryable, userId: string, circleId: string) {
  const { rows } = await q.query<{ name: string; owner_id: string }>(
    `select c.name, c.owner_id from public.prayer_circles c join public.prayer_circle_members m on m.circle_id = c.id and m.user_id = $2 where c.id = $1`,
    [circleId, userId],
  );
  if (!rows[0]) throw notFound('Circle');
  return rows[0];
}

type StudyRow = {
  id: string;
  circle_id: string;
  user_id: string;
  author: string | null;
  body: string;
  created_at: Date;
  study_collection: CollectionId;
  study_key: string;
  study_ref: string;
  study_quote: string;
  study_citation: string;
  study_plan_id: string | null;
  study_plan_day: number | null;
  owner_id: string;
  replies: number;
  last_at: Date | null;
};

const STUDY = `select x.id, x.circle_id, x.user_id, pr.display_name as author, x.body, x.created_at, x.study_collection, x.study_key,
                      x.study_ref, x.study_quote, x.study_citation, x.study_plan_id, x.study_plan_day, c.owner_id,
                      (select count(*)::int from public.circle_replies r where r.circle_post_id = x.id) as replies,
                      (select max(r.created_at) from public.circle_replies r where r.circle_post_id = x.id) as last_at
                 from public.circle_posts x join public.profiles pr on pr.id = x.user_id join public.prayer_circles c on c.id = x.circle_id`;
const notBlocked = (col: string) => `not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = ${col})`;

function shape(r: StudyRow, userId: string) {
  const plan = r.study_plan_id ? plans.planSpecs().find((p) => p.id === r.study_plan_id) : undefined;
  return {
    id: r.id,
    circleId: r.circle_id,
    prompt: r.body,
    author: { id: r.user_id, displayName: r.author },
    createdAt: r.created_at.toISOString(),
    passage: { collection: r.study_collection, ref: r.study_ref, key: r.study_key, quote: r.study_quote, citation: r.study_citation },
    plan: plan && r.study_plan_day ? { id: plan.id, title: plan.title, day: r.study_plan_day } : null,
    replies: r.replies,
    lastReplyAt: r.last_at?.toISOString() ?? null,
    canRemove: r.user_id === userId || r.owner_id === userId,
  };
}

/** The circle's studies, newest talk first. */
export async function list(q: Queryable, userId: string, circleId: string) {
  const ids = await allowed(q, userId);
  const c = await memberOf(q, userId, circleId);
  const { rows } = await q.query<StudyRow>(
    `${STUDY} where x.circle_id = $1 and x.study_key is not null and x.study_collection = any($3::text[]) and ${notBlocked('x.user_id')}
      order by coalesce((select max(r.created_at) from public.circle_replies r where r.circle_post_id = x.id), x.created_at) desc limit 50`,
    [circleId, userId, ids],
  );
  return { circle: { id: circleId, name: c.name }, studies: rows.map((r) => shape(r, userId)) };
}

export const StartInput = z.union([
  z.object({ circleId: z.uuid(), collection: z.enum(COLLECTIONS), key: z.string().regex(/^[0-9a-f]{32}$/), prompt: z.string().trim().min(1).max(2000) }),
  z.object({ circleId: z.uuid(), planId: z.string().min(1).max(80), day: z.number().int().min(1).max(400), prompt: z.string().trim().min(1).max(2000) }),
]);

/** Starts a study: the passage (or the plan day's reading) and a question or thought to open the talk. */
export async function start(q: Queryable, userId: string, input: z.infer<typeof StartInput>) {
  const ids = await allowed(q, userId);
  await memberOf(q, userId, input.circleId);
  let study: { collection: CollectionId; key: string; ref: string; quote: string; citation: string; planId: string | null; day: number | null };
  if ('key' in input) {
    if (!ids.includes(input.collection)) throw forbidden('This collection is not offered in your community');
    const found = byKey(input.collection, input.key);
    if (!found) throw notFound('Passage');
    const p = found.passage;
    const work = collection(input.collection).works.get(p.workId)!;
    study = { collection: input.collection, key: input.key, ref: p.ref, quote: p.text, citation: citation(input.collection, p.ref, work), planId: null, day: null };
  } else {
    if (!(await features(q)).libraryPlans) throw forbidden('Reading plans are off');
    const d = await plans.day(q, userId, input.planId, input.day);
    study = { collection: d.reading.collection, key: d.reading.key, ref: d.reading.ref, quote: d.reading.text, citation: d.reading.citation, planId: input.planId, day: input.day };
  }
  // The circle's own post: members get its one quiet heads-up a day.
  const { id } = await circles.post(q, userId, input.circleId, input.prompt);
  await q.query(
    `update public.circle_posts set study_collection = $2, study_key = $3, study_ref = $4, study_quote = $5, study_citation = $6,
            study_plan_id = $7, study_plan_day = $8 where id = $1`,
    [id, study.collection, study.key, study.ref.slice(0, 200), study.quote.slice(0, 1500), study.citation.slice(0, 300), study.planId, study.day],
  );
  return { id };
}

async function studyOf(q: Queryable, userId: string, studyId: string, ids: CollectionId[]) {
  const { rows } = await q.query<StudyRow>(
    `${STUDY}
      join public.prayer_circle_members m on m.circle_id = x.circle_id and m.user_id = $2
     where x.id = $1 and x.study_key is not null and x.study_collection = any($3::text[])`,
    [studyId, userId, ids],
  );
  if (!rows[0]) throw notFound('Study');
  return rows[0];
}

/** One study and its talk, oldest first; answers sit under the reply they answer. */
export async function get(q: Queryable, userId: string, studyId: string) {
  const ids = await allowed(q, userId);
  const s = await studyOf(q, userId, studyId, ids);
  const { rows } = await q.query<{ id: string; parent_id: string | null; user_id: string; author: string | null; body: string; created_at: Date }>(
    `select r.id, r.parent_id, r.user_id, pr.display_name as author, r.body, r.created_at
       from public.circle_replies r join public.profiles pr on pr.id = r.user_id
      where r.circle_post_id = $1 and ${notBlocked('r.user_id')}
      order by r.created_at`,
    [studyId, userId],
  );
  const reply = (r: (typeof rows)[number]) => ({
    id: r.id,
    author: { id: r.user_id, displayName: r.author },
    body: r.body,
    createdAt: r.created_at.toISOString(),
    canRemove: r.user_id === userId || s.owner_id === userId,
  });
  const top = rows.filter((r) => !r.parent_id);
  return {
    study: shape(s, userId),
    replies: top.map((r) => ({ ...reply(r), answers: rows.filter((a) => a.parent_id === r.id).map(reply) })),
  };
}

export const ReplyInput = z.object({ body: z.string().trim().min(1).max(1000), parentId: z.uuid().nullable().optional() });

/** A reply to the study, or an answer to one of its replies (one level deep). */
export async function reply(q: Queryable, userId: string, studyId: string, input: z.infer<typeof ReplyInput>) {
  const ids = await allowed(q, userId);
  await studyOf(q, userId, studyId, ids);
  let parent: string | null = null;
  if (input.parentId) {
    const { rows } = await q.query<{ id: string; parent_id: string | null }>('select id, parent_id from public.circle_replies where id = $1 and circle_post_id = $2', [input.parentId, studyId]);
    if (!rows[0]) throw badRequest('That reply is not in this study');
    // An answer to an answer joins the same thread.
    parent = rows[0].parent_id ?? rows[0].id;
  }
  const { id } = await circles.reply(q, userId, studyId, input.body);
  if (parent) await q.query('update public.circle_replies set parent_id = $2 where id = $1', [id, parent]);
  return { id };
}

/** The reply's author or the circle's starter takes a reply down, with the answers under it. */
export async function removeReply(q: Queryable, userId: string, replyId: string) {
  await allowed(q, userId);
  const { rows } = await q.query<{ user_id: string; owner_id: string }>(
    `select r.user_id, c.owner_id from public.circle_replies r join public.circle_posts p on p.id = r.circle_post_id
       join public.prayer_circles c on c.id = p.circle_id
       join public.prayer_circle_members m on m.circle_id = p.circle_id and m.user_id = $2
      where r.id = $1 and p.study_key is not null`,
    [replyId, userId],
  );
  if (!rows[0]) throw notFound('Reply');
  if (rows[0].user_id !== userId && rows[0].owner_id !== userId) throw forbidden('Only the author or the circle’s starter can take this down');
  await q.query('delete from public.circle_replies where id = $1', [replyId]);
  return { removed: true };
}

/** The study's author or the circle's starter takes the whole study down. */
export async function remove(q: Queryable, userId: string, studyId: string) {
  const ids = await allowed(q, userId);
  await studyOf(q, userId, studyId, ids);
  return circles.removePost(q, userId, studyId);
}
