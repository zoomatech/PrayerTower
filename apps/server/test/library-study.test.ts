// Word study, highlights and notes, and offline texts for Text search (docs/LIBRARY_SEARCH.md): all off by
// default. Word study is offered only where the King James Bible is; notes are private unless shared with a
// circle the writer belongs to; offline downloads are only of collections the member's community is offered.
import { gunzipSync } from 'node:zlib';
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as notes from '../src/modules/library/notes.js';
import * as offline from '../src/modules/library/offline.js';
import * as words from '../src/modules/library/words.js';
import { as, createUser, db } from './helpers.js';

const switches = (on: boolean) => db.query('update public.library_settings set enabled = $1, words_enabled = $1, notes_enabled = $1, offline_enabled = $1', [on]);

afterAll(async () => {
  await switches(false);
  await db.end();
});

/** Runs a check as a member of Open Circle, rolled back afterwards. */
async function inOpenCircle(member: string, check: (c: PoolClient) => Promise<void>) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await c.query('delete from public.community_memberships where user_id = $1', [member]);
    await c.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [member]);
    await check(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

describe('word study', () => {
  it('is off by default, then shows a verse word by word with its Hebrew roots', async () => {
    const member = await createUser('Word Student');
    await switches(false);
    expect((await as(member).get('/library/words?ref=Genesis 1:1')).statusCode).toBe(403);

    await switches(true);
    const v = (await as(member).get('/library/words?ref=Genesis 1:1')).json();
    expect(v).toMatchObject({ ref: 'Genesis 1:1', citation: 'Genesis 1:1 (King James Bible)' });
    expect(v.key).toMatch(/^[0-9a-f]{32}$/);
    expect(v.words).toContainEqual({ text: 'beginning', strongs: ['H7225'] });
    expect(v.roots.H7225).toEqual({ lemma: 'רֵאשִׁית', translit: 'rêʼshîyth' });
    expect(v.words.map((w: { text: string }) => w.text).join('')).toMatch(/^In the beginning God created the heaven and the earth\.?$/);
    expect((await as(member).get('/library/words?ref=Genesis 99:1')).statusCode).toBe(404);
  });

  it('opens a Greek word with its meaning and the verses that use it, paged', async () => {
    const member = await createUser('Word Greek');
    await switches(true);
    const e = (await as(member).get('/library/words/G26?limit=5')).json();
    expect(e).toMatchObject({ id: 'G26', language: 'Greek', lemma: 'ἀγάπη' });
    expect(e.definition).toMatch(/love/i);
    expect(e.total).toBeGreaterThan(100);
    expect(e.verses).toHaveLength(5);
    expect(e.verses[0].citation).toMatch(/\(King James Bible\)$/);
    expect(e.verses[0].as.join(' ')).toMatch(/love|charity/i);
    const next = (await as(member).get('/library/words/G26?offset=5&limit=5')).json();
    expect(next.verses[0].ref).not.toBe(e.verses[0].ref);
    expect((await as(member).get('/library/words/H99999')).statusCode).toBe(400);
    expect((await as(member).get('/library/words/H9999')).statusCode).toBe(404);
  });

  it('is never offered in Open Circle', async () => {
    const member = await createUser('Word Secular');
    await switches(true);
    await inOpenCircle(member, async (c) => {
      await expect(words.verse(c, member, 'John 3:16')).rejects.toThrow(/not offered/);
      await expect(words.entry(c, member, 'G26', { offset: 0, limit: 5 })).rejects.toThrow(/not offered/);
    });
  });
});

describe('highlights and notes', () => {
  const find = async (member: string, q: string, collection: string) => (await as(member).get(`/library/search?q=${q}&collection=${collection}&limit=1`)).json().hits[0];

  it('is off by default, then marks a passage privately, changes it, and clears it', async () => {
    const member = await createUser('Note Taker');
    const other = await createUser('Note Neighbour');
    await switches(true);
    const hit = await find(member, 'the lord is my shepherd', 'bible-kjv');
    await db.query('update public.library_settings set notes_enabled = false');
    expect((await as(member).put('/library/notes', { collection: 'bible-kjv', key: hit.key, color: 'yellow' })).statusCode).toBe(403);
    await switches(true);

    const saved = (await as(member).put('/library/notes', { collection: 'bible-kjv', key: hit.key, color: 'yellow' })).json();
    expect(saved.note).toMatchObject({ collection: 'bible-kjv', ref: 'Psalms 23:1', citation: 'Psalms 23:1 (King James Bible)', color: 'yellow', note: null, circle: null });
    expect(saved.note.quote).toMatch(/shepherd/);
    const withNote = (await as(member).put('/library/notes', { collection: 'bible-kjv', key: hit.key, note: 'Read at Gran’s funeral.' })).json();
    expect(withNote.note).toMatchObject({ id: saved.note.id, color: 'yellow', note: 'Read at Gran’s funeral.' });
    expect((await as(member).get('/library/notes')).json().notes).toHaveLength(1);
    expect((await as(other).get('/library/notes')).json().notes).toHaveLength(0);
    expect((await as(other).delete(`/library/notes/${saved.note.id}`)).statusCode).toBe(404);

    // A note in another collection, filtered by collection.
    const tao = await find(member, 'the tao that can be trodden', 'world-classics');
    await as(member).put('/library/notes', { collection: 'world-classics', key: tao.key, color: 'green' });
    expect((await as(member).get('/library/notes?collection=world-classics')).json().notes.map((n: { ref: string }) => n.ref)).toEqual([tao.ref]);

    expect((await as(member).put('/library/notes', { collection: 'bible-kjv', key: hit.key, color: null, note: '' })).json()).toEqual({ note: null });
    expect((await as(member).get('/library/notes?collection=bible-kjv')).json().notes).toHaveLength(0);
    expect((await as(member).put('/library/notes', { collection: 'bible-kjv', key: '0'.repeat(32), color: 'blue' })).statusCode).toBe(404);
    expect((await as(member).put('/library/notes', { collection: 'bible-kjv', key: hit.key, color: 'purple' })).statusCode).toBe(400);
  });

  it('shares a note with a circle only its members see', async () => {
    const a = await createUser('Circle Noter');
    const b = await createUser('Circle Friend');
    const stranger = await createUser('Circle Stranger');
    await switches(true);
    const { rows } = await db.query<{ id: string }>(`insert into public.prayer_circles (name, owner_id) values ('Study group', $1) returning id`, [a]);
    const circle = rows[0]!.id;
    await db.query('insert into public.prayer_circle_members (circle_id, user_id) values ($1, $2), ($1, $3)', [circle, a, b]);
    const hit = await find(a, 'charity suffereth long and is kind', 'bible-kjv');

    expect((await as(stranger).put('/library/notes', { collection: 'bible-kjv', key: hit.key, note: 'Mine', circleId: circle })).statusCode).toBe(400);
    const shared = (await as(a).put('/library/notes', { collection: 'bible-kjv', key: hit.key, note: 'For Sunday.', circleId: circle })).json();
    expect(shared.note.circle).toEqual({ id: circle, name: 'Study group' });

    const seen = (await as(b).get(`/library/notes/circle/${circle}`)).json().notes;
    expect(seen).toEqual([expect.objectContaining({ id: shared.note.id, note: 'For Sunday.', author: 'Circle Noter', mine: false })]);
    expect((await as(stranger).get(`/library/notes/circle/${circle}`)).statusCode).toBe(404);
    // Someone who blocked the writer no longer sees their notes, as with circle posts.
    await db.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2)', [b, a]);
    expect((await as(b).get(`/library/notes/circle/${circle}`)).json().notes).toHaveLength(0);
    await db.query('delete from public.user_blocks where user_id = $1 and blocked_id = $2', [b, a]);
    // A colour alone is never shared.
    await as(a).put('/library/notes', { collection: 'bible-kjv', key: hit.key, note: '', color: 'pink' });
    expect((await as(b).get(`/library/notes/circle/${circle}`)).json().notes).toHaveLength(0);
  });

  it('hides Bible notes in Open Circle and refuses to mark the Bible there', async () => {
    const member = await createUser('Note Secular');
    await switches(true);
    const hit = await find(member, 'the lord is my shepherd', 'bible-kjv');
    await as(member).put('/library/notes', { collection: 'bible-kjv', key: hit.key, color: 'blue' });
    await inOpenCircle(member, async (c) => {
      expect((await notes.list(c, member, {})).notes).toHaveLength(0);
      await expect(notes.save(c, member, { collection: 'bible-kjv', key: hit.key, color: 'green' })).rejects.toThrow(/not offered/);
    });
  });
});

describe('offline texts', () => {
  it('is off by default, then lists and sends the offered collections as gzipped files', async () => {
    const member = await createUser('Offline Reader');
    await switches(false);
    await db.query('update public.library_settings set enabled = true');
    expect((await as(member).get('/library/offline')).json()).toEqual({ enabled: false });
    expect((await as(member).get('/library/offline/bible-kjv')).statusCode).toBe(403);

    await switches(true);
    const list = (await as(member).get('/library/offline')).json();
    const kjv = list.collections.find((c: { id: string }) => c.id === 'bible-kjv');
    expect(kjv).toMatchObject({ title: 'King James Bible', faith: true, passages: 31102 });
    expect(kjv.version).toMatch(/^[0-9a-f]{16}$/);
    const r = await as(member).get('/library/offline/world-classics');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
    const body = JSON.parse(gunzipSync(r.rawPayload).toString('utf8'));
    expect(body.works.length).toBeGreaterThan(0);
    expect((await as(member).get('/library/offline/nothing')).statusCode).toBe(400);
  });

  it('never offers the Bible offline in Open Circle', async () => {
    const member = await createUser('Offline Secular');
    await switches(true);
    await inOpenCircle(member, async (c) => {
      const list = await offline.list(c, member);
      expect(list.enabled && list.collections.map((x) => x.id)).toEqual(['ancient-writings', 'oldest-texts', 'world-classics']);
      await expect(offline.download(c, member, 'bible-kjv')).rejects.toThrow(/not offered/);
    });
  });
});
