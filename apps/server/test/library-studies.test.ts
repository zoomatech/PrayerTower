// Circle study rooms for Text search (docs/LIBRARY_SEARCH.md): off by default; a circle studies a passage or a
// plan day in a threaded talk that only its members see, kept off the circle's feed, with take-downs by the
// author or the circle's starter, blocked people left out, and the Bible left out in Open Circle.
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as studies from '../src/modules/library/studies.js';
import { as, createUser, db } from './helpers.js';

const switches = (on: boolean) => db.query('update public.library_settings set enabled = $1, studies_enabled = $1, plans_enabled = $1', [on]);
const circlesOn = (on: boolean) => db.query('update public.practice_settings set prayer_circles_enabled = $1', [on]);

afterAll(async () => {
  await switches(false);
  await db.query('update public.library_settings set listen_enabled = false');
  await circlesOn(false);
  await db.end();
});

async function circleOf(owner: string, ...others: string[]) {
  const { rows } = await db.query<{ id: string }>(`insert into public.prayer_circles (name, owner_id) values ('Study group', $1) returning id`, [owner]);
  for (const u of [owner, ...others]) await db.query('insert into public.prayer_circle_members (circle_id, user_id) values ($1, $2)', [rows[0]!.id, u]);
  return rows[0]!.id;
}

const find = async (member: string, q: string, collection: string) => (await as(member).get(`/library/search?q=${q}&collection=${collection}&limit=1`)).json().hits[0];

describe('study rooms', () => {
  it('is off by default, then studies a passage in a threaded talk only the circle sees', async () => {
    const a = await createUser('Study Starter');
    const b = await createUser('Study Friend');
    const stranger = await createUser('Study Stranger');
    await circlesOn(true);
    await switches(true);
    const circle = await circleOf(a, b);
    const hit = await find(a, 'the lord is my shepherd', 'bible-kjv');
    await db.query('update public.library_settings set studies_enabled = false');
    expect((await as(a).get(`/library/studies?circle=${circle}`)).statusCode).toBe(403);
    await switches(true);

    const made = await as(a).post('/library/studies', { circleId: circle, collection: 'bible-kjv', key: hit.key, prompt: 'What does “I shall not want” mean to you this week?' });
    expect(made.statusCode).toBe(201);
    const id = made.json().id;
    expect((await as(stranger).post('/library/studies', { circleId: circle, collection: 'bible-kjv', key: hit.key, prompt: 'x' })).statusCode).toBe(404);

    const list = (await as(b).get(`/library/studies?circle=${circle}`)).json();
    expect(list.studies).toEqual([expect.objectContaining({ id, prompt: 'What does “I shall not want” mean to you this week?', passage: expect.objectContaining({ ref: 'Psalms 23:1', citation: 'Psalms 23:1 (King James Bible)' }), canRemove: false, plan: null })]);
    // Kept off the circle's feed.
    expect((await as(b).get(`/circles/${circle}`)).json().posts.map((p: { id: string }) => p.id)).not.toContain(id);

    const r1 = (await as(b).post(`/library/studies/${id}/replies`, { body: 'That I already have enough.' })).json().id;
    const r2 = (await as(a).post(`/library/studies/${id}/replies`, { body: 'Yes, enough for today.', parentId: r1 })).json().id;
    // An answer to an answer joins the same thread.
    await as(b).post(`/library/studies/${id}/replies`, { body: 'Amen.', parentId: r2 });
    const room = (await as(a).get(`/library/studies/${id}`)).json();
    expect(room.replies).toHaveLength(1);
    expect(room.replies[0]).toMatchObject({ body: 'That I already have enough.', canRemove: true, answers: [{ body: 'Yes, enough for today.' }, { body: 'Amen.' }] });
    expect((await as(stranger).get(`/library/studies/${id}`)).statusCode).toBe(404);
    expect((await as(stranger).post(`/library/studies/${id}/replies`, { body: 'Hi' })).statusCode).toBe(404);

    // Take-downs: a member can't take down someone else's reply; the starter can, with its answers.
    expect((await as(b).delete(`/library/study-replies/${r2}`)).statusCode).toBe(403);
    expect((await as(a).delete(`/library/study-replies/${r1}`)).statusCode).toBe(200);
    expect((await as(b).get(`/library/studies/${id}`)).json().replies).toEqual([]);
    expect((await as(b).delete(`/library/studies/${id}`)).statusCode).toBe(403);
    expect((await as(a).delete(`/library/studies/${id}`)).statusCode).toBe(200);
    expect((await as(b).get(`/library/studies?circle=${circle}`)).json().studies).toEqual([]);
  });

  it('studies a reading-plan day, and leaves out the words of people you blocked', async () => {
    const a = await createUser('Plan Studier');
    const b = await createUser('Plan Blocked');
    await circlesOn(true);
    await switches(true);
    const circle = await circleOf(a, b);
    const id = (await as(a).post('/library/studies', { circleId: circle, planId: 'psalms-30', day: 1, prompt: 'Which line stays with you?' })).json().id;
    await as(b).post(`/library/studies/${id}/replies`, { body: 'Like a tree planted by the rivers.' });
    const room = (await as(a).get(`/library/studies/${id}`)).json();
    expect(room.study).toMatchObject({ plan: { id: 'psalms-30', title: 'Psalms in 30 days', day: 1 }, passage: { citation: 'Psalms 1–5 (King James Bible)' } });
    expect(room.replies).toHaveLength(1);
    await db.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2)', [a, b]);
    expect((await as(a).get(`/library/studies/${id}`)).json().replies).toEqual([]);
    expect((await as(a).post('/library/studies', { circleId: circle, planId: 'psalms-30', day: 999, prompt: 'x' })).statusCode).toBe(400);
  });

  it('leaves Bible studies out in Open Circle and refuses to start one there', async () => {
    const a = await createUser('Study Faith');
    const b = await createUser('Study Secular');
    await circlesOn(true);
    await switches(true);
    const circle = await circleOf(a, b);
    const hit = await find(a, 'the lord is my shepherd', 'bible-kjv');
    await as(a).post('/library/studies', { circleId: circle, collection: 'bible-kjv', key: hit.key, prompt: 'Thoughts?' });
    const tao = await find(a, 'the tao that can be trodden', 'world-classics');
    await as(a).post('/library/studies', { circleId: circle, collection: 'world-classics', key: tao.key, prompt: 'And this?' });
    const c: PoolClient = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
      await c.query('delete from public.community_memberships where user_id = $1', [b]);
      await c.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [b]);
      const seen = await studies.list(c, b, circle);
      expect(seen.studies.map((s) => s.passage.collection)).toEqual(['world-classics']);
      await expect(studies.start(c, b, { circleId: circle, collection: 'bible-kjv', key: hit.key, prompt: 'x' })).rejects.toThrow(/not offered/);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});

describe('listening', () => {
  it('is off by default, then finds the LibriVox recording of the chapter a passage is in, with its credit', async () => {
    const member = await createUser('Listener');
    await switches(true);
    const psalm = await find(member, 'the lord is my shepherd', 'bible-kjv');
    expect((await as(member).get(`/library/listen?collection=bible-kjv&key=${psalm.key}`)).statusCode).toBe(403);
    await db.query('update public.library_settings set listen_enabled = true');
    const r = (await as(member).get(`/library/listen?collection=bible-kjv&key=${psalm.key}`)).json().recording;
    expect(r).toMatchObject({ title: 'Chapter 07 - Psalms 21 - 23', project: 'Bible (KJV) 19: Psalms (version 2)' });
    expect(r.url).toMatch(/^https:\/\/.*archive\.org\/download\/.+\.mp3$/);
    expect(r.credit).toMatch(/^Read by .+ for LibriVox: Bible \(KJV\) 19: Psalms \(version 2\), “Chapter 07 - Psalms 21 - 23”\. Public domain\.$/);

    // A book of the Iliad, found from a passage under one of its sub-headings.
    const iliad = (await as(member).get('/library/search?q=Achilles Priam ransom body Hector&collection=world-classics&limit=20')).json().hits.find((h: { work: { id: string } }) => h.work.id === 'iliad-butler');
    const book = (await as(member).get(`/library/listen?collection=world-classics&key=${iliad.key}`)).json().recording;
    expect(book.project).toBe('Iliad');
    expect(book.title).toMatch(/^Book [IVX]+:/);

    // The Analects are recorded only in another translation: none offered.
    const analects = (await as(member).get('/library/search?q=Confucius said learning&collection=world-classics&limit=20')).json().hits.find((h: { work: { id: string } }) => h.work.id === 'analects-legge');
    expect((await as(member).get(`/library/listen?collection=world-classics&key=${analects.key}`)).json()).toEqual({ recording: null });
    expect((await as(member).get(`/library/listen?collection=bible-kjv&key=${'0'.repeat(32)}`)).statusCode).toBe(404);
  });
});
