// Prayer Squire board: off by default, opt-in, anonymous members never appear,
// ranks verified prayers for other people within the viewer's community.
import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set squire_board_enabled = false');
  await db.end();
});

describe('Prayer Squire board', () => {
  it('lists members who opted in, never anonymous ones', async () => {
    const squire = await createUser('Squire Sam');
    const quiet = await createUser('Quiet Quinn');
    const hidden = await createUser('Hidden Hal');
    expect((await as(squire).get('/squire-board')).json()).toEqual({ enabled: false });
    expect((await as(squire).put('/me/squire-board', { public: true })).statusCode).toBe(403);

    await db.query('update public.notebook_settings set squire_board_enabled = true');
    const post = await newRequest(await createUser('Squire Asker'), 'Pray for my new job.');
    for (const u of [squire, quiet, hidden]) await as(u).post(`/posts/${post.id}/praying-now`, {});

    const joined = await as(squire).put('/me/squire-board', { public: true });
    expect(joined.json()).toMatchObject({ enabled: true, onBoard: true, canJoin: true });
    await as(hidden).put('/me/squire-board', { public: true });
    await db.query('update public.profiles set anonymous_by_default = true where id = $1', [hidden]);
    expect((await as(hidden).put('/me/squire-board', { public: true })).statusCode).toBe(403);

    const view = (await as(quiet).get('/squire-board')).json() as { onBoard: boolean; entries: { personId: string; prayers: number }[] };
    expect(view.onBoard).toBe(false);
    const ids = view.entries.map((e) => e.personId);
    expect(ids).toContain(squire);
    expect(ids).not.toContain(quiet);
    expect(ids).not.toContain(hidden);
    expect((await as(quiet).get(`/people/${squire}`)).json().person.squire).toBe(true);
    expect((await as(squire).get(`/people/${hidden}`)).json().person.squire).toBe(false);

    await as(squire).put('/me/squire-board', { public: false });
    expect(((await as(quiet).get('/squire-board')).json() as { entries: { personId: string }[] }).entries.map((e) => e.personId)).not.toContain(squire);
  });
});
