// Thank the pray-ers: one warm note from the asker to everyone who prayed, each told once;
// pray-ers can answer "Glad to", and only the asker sees how many did.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set thank_note_enabled = $1', [v]);
const note = 'Thank you all for carrying this with me. The surgery went well, and I felt every prayer.';

async function prayed() {
  const [asker, a, b, stranger] = [await createUser('Thanks Asker'), await createUser('Thanks A'), await createUser('Thanks B'), await createUser('Thanks Stranger')];
  const post = await newRequest(asker);
  for (const u of [a, b]) await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [post.id, u]);
  return { asker, a, b, stranger, post };
}

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Thank the pray-ers', () => {
  it('is refused while off', async () => {
    const t = await prayed();
    expect((await as(t.asker).post(`/posts/${t.post.id}/thank-note`, { body: note })).statusCode).toBe(400);
  });

  it('sends one note to everyone who prayed, once', async () => {
    await on(true);
    const t = await prayed();
    expect((await as(t.asker).get(`/posts/${t.post.id}/thank-note`)).json()).toEqual({ enabled: true, note: null, canWrite: true });
    expect((await as(t.a).post(`/posts/${t.post.id}/thank-note`, { body: note })).statusCode).toBe(403);
    const r = await as(t.asker).post(`/posts/${t.post.id}/thank-note`, { body: note });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ sent: 2 });
    expect((await as(t.asker).post(`/posts/${t.post.id}/thank-note`, { body: note })).statusCode).toBe(409);
    const { rows } = await db.query<{ title: string }>("select title from public.notifications where user_id = $1 and kind = 'thank_note'", [t.a]);
    expect(rows).toEqual([{ title: 'A thank-you from Thanks Asker' }]);
    // A stranger sees nothing; a pray-er sees the note; only the asker sees the count.
    expect((await as(t.stranger).get(`/posts/${t.post.id}/thank-note`)).json().note).toBeNull();
    expect((await as(t.a).post(`/posts/${t.post.id}/thank-note/glad`)).statusCode).toBe(200);
    expect((await as(t.stranger).post(`/posts/${t.post.id}/thank-note/glad`)).statusCode).toBe(403);
    const seen = (await as(t.a).get(`/posts/${t.post.id}/thank-note`)).json().note;
    expect(seen.gladByMe).toBe(true);
    expect(seen.glad).toBeUndefined();
    expect((await as(t.asker).get(`/posts/${t.post.id}/thank-note`)).json().note.glad).toBe(1);
  });

  it('skips pray-ers where either blocked the other', async () => {
    await on(true);
    const t = await prayed();
    expect((await as(t.b).put(`/people/${t.asker}/block`)).statusCode).toBe(200);
    expect((await as(t.asker).post(`/posts/${t.post.id}/thank-note`, { body: note })).json()).toEqual({ sent: 1 });
    const { rows } = await db.query("select 1 from public.notifications where user_id = $1 and kind = 'thank_note'", [t.b]);
    expect(rows).toEqual([]);
    expect((await as(t.b).get(`/posts/${t.post.id}/thank-note`)).json().note).toBeNull();
    expect((await as(t.b).post(`/posts/${t.post.id}/thank-note/glad`)).statusCode).toBe(403);
    await on(false);
  });
});
