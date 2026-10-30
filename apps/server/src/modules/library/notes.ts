// Highlights and notes (docs/LIBRARY_SEARCH.md): a member marks any passage in any collection they are offered
// with a colour and/or a note. Private by default; a note can be shared with one of their prayer circles, whose
// members see it with the passage it is on. Off by default.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { byKey, citation, collection, COLLECTIONS, features, offered, type CollectionId } from './index.js';

async function allowed(q: Queryable, userId: string) {
  if (!(await features(q)).libraryNotes) throw forbidden('Highlights and notes are off');
  const ids = await offered(q, userId);
  if (!ids) throw forbidden('Library search is off');
  return ids;
}

type Row = {
  id: string;
  collection: string;
  work_id: string;
  ref: string;
  passage_key: string;
  quote: string;
  citation: string;
  color: string | null;
  note: string | null;
  circle_id: string | null;
  circle_name: string | null;
  updated_at: Date;
};

const shape = (r: Row) => ({
  id: r.id,
  collection: r.collection,
  workId: r.work_id,
  ref: r.ref,
  key: r.passage_key,
  quote: r.quote,
  citation: r.citation,
  color: r.color,
  note: r.note,
  circle: r.circle_id ? { id: r.circle_id, name: r.circle_name ?? '' } : null,
  updatedAt: r.updated_at.toISOString(),
});

const SELECT = `select n.id, n.collection, n.work_id, n.ref, n.passage_key, n.quote, n.citation, n.color, n.note, n.circle_id,
                       c.name as circle_name, n.updated_at
                  from public.library_notes n left join public.prayer_circles c on c.id = n.circle_id`;

export const ListQuery = z.object({ collection: z.enum(COLLECTIONS).optional() });

/** The member's own highlights and notes, newest first; only in collections their community is offered. */
export async function list(q: Queryable, userId: string, input: z.infer<typeof ListQuery>) {
  const ids = await allowed(q, userId);
  const { rows } = await q.query<Row>(
    `${SELECT} where n.user_id = $1 and n.collection = any($2::text[]) and ($3::text is null or n.collection = $3)
      order by n.updated_at desc limit 500`,
    [userId, ids, input.collection ?? null],
  );
  return { notes: rows.map(shape) };
}

export const SaveInput = z.object({
  collection: z.enum(COLLECTIONS),
  key: z.string().regex(/^[0-9a-f]{32}$/),
  color: z.enum(['yellow', 'green', 'blue', 'pink']).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  circleId: z.uuid().nullable().optional(),
});

/** Marks a passage: a colour, a note, or both. Clearing both removes the mark. */
export async function save(q: Queryable, userId: string, input: z.infer<typeof SaveInput>) {
  const ids = await allowed(q, userId);
  if (!ids.includes(input.collection)) throw forbidden('This collection is not offered in your community');
  const found = byKey(input.collection as CollectionId, input.key);
  if (!found) throw notFound('Passage');
  if (input.circleId) {
    const { rowCount } = await q.query('select 1 from public.prayer_circle_members where circle_id = $1 and user_id = $2', [input.circleId, userId]);
    if (!rowCount) throw badRequest('Pick a circle you belong to');
  }
  const { rows: before } = await q.query<{ color: string | null; note: string | null; circle_id: string | null }>(
    'select color, note, circle_id from public.library_notes where user_id = $1 and collection = $2 and passage_key = $3',
    [userId, input.collection, input.key],
  );
  const color = input.color === undefined ? (before[0]?.color ?? null) : input.color;
  const note = input.note === undefined ? (before[0]?.note ?? null) : input.note || null;
  const circleId = input.circleId === undefined ? (before[0]?.circle_id ?? null) : input.circleId;
  if (!color && !note) {
    await q.query('delete from public.library_notes where user_id = $1 and collection = $2 and passage_key = $3', [userId, input.collection, input.key]);
    return { note: null };
  }
  const p = found.passage;
  const work = collection(input.collection as CollectionId).works.get(p.workId)!;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.library_notes (user_id, collection, work_id, ref, passage_key, quote, citation, color, note, circle_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (user_id, collection, passage_key) do update set color = excluded.color, note = excluded.note,
       circle_id = excluded.circle_id, updated_at = now()
     returning id`,
    [userId, input.collection, p.workId, p.ref.slice(0, 200), input.key, p.text.slice(0, 400), citation(input.collection as CollectionId, p.ref, work).slice(0, 300), color, note, note ? circleId : null],
  );
  const { rows: made } = await q.query<Row>(`${SELECT} where n.id = $1`, [rows[0]!.id]);
  return { note: shape(made[0]!) };
}

export async function remove(q: Queryable, userId: string, id: string) {
  await allowed(q, userId);
  const { rowCount } = await q.query('delete from public.library_notes where id = $1 and user_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Note');
  return { removed: true };
}

/** Notes shared with a circle the member belongs to, newest first, with who wrote them. */
export async function circle(q: Queryable, userId: string, circleId: string) {
  const ids = await allowed(q, userId);
  const { rowCount } = await q.query('select 1 from public.prayer_circle_members where circle_id = $1 and user_id = $2', [circleId, userId]);
  if (!rowCount) throw notFound('Circle');
  const { rows } = await q.query<Row & { author: string | null; mine: boolean }>(
    `select n.id, n.collection, n.work_id, n.ref, n.passage_key, n.quote, n.citation, n.color, n.note, n.circle_id, c.name as circle_name,
            n.updated_at, p.display_name as author, n.user_id = $2 as mine
       from public.library_notes n join public.prayer_circles c on c.id = n.circle_id join public.profiles p on p.id = n.user_id
       join public.prayer_circle_members m on m.circle_id = n.circle_id and m.user_id = n.user_id
      where n.circle_id = $1 and n.note is not null and n.collection = any($3::text[])
        -- As with circle posts: notes from someone the viewer blocked stay hidden.
        and not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = n.user_id)
      order by n.updated_at desc limit 100`,
    [circleId, userId, ids],
  );
  return { notes: rows.map((r) => ({ ...shape(r), author: r.author ?? '', mine: r.mine })) };
}
