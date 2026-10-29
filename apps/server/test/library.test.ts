// Scripture and ancient writings search, ported from Winstons Syndicate: off by default; the
// passage search finds words, the KJV's forms of them and their synonyms; the Bible is never
// offered in Open Circle, the ancient writings are.
import { afterAll, describe, expect, it } from 'vitest';
import * as library from '../src/modules/library/index.js';
import { PassageIndex, parseSynonyms, stem } from '../src/modules/library/search.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.library_settings set enabled = false');
  await db.end();
});

describe('passage search', () => {
  it('compares the KJV forms of a word', () => {
    expect(['loveth', 'loved', 'love', 'loves'].map(stem)).toEqual(['lov', 'lov', 'lov', 'lov']);
    expect(['thee', 'ye', 'thou'].map(stem)).toEqual(['you', 'you', 'you']);
    expect(stem('saith')).toBe('say');
  });

  it('ranks passages holding every word first, then synonyms, and gives one verse a passage', () => {
    const passages = [
      { workId: 'a', ref: 'A 1', text: 'The shepherd took his staff.' },
      { workId: 'a', ref: 'A 2', text: 'And he went out.' },
      { workId: 'b', ref: 'B 1', text: 'Thy rod and thy staff they comfort me.' },
      { workId: 'c', ref: 'C 1', text: 'Nothing here at all.' },
      // Synonyms only widen words found in fewer than one passage in ten, so the corpus needs some bulk.
      ...Array.from({ length: 30 }, (_, i) => ({ workId: `f${i}`, ref: `F ${i}`, text: 'Some other words entirely.' })),
    ];
    const index = new PassageIndex(passages, parseSynonyms('rod\tstaff'));
    const hits = index.search('rod staff');
    expect(hits[0]).toEqual({ index: 2, complete: true });
    // "rod" counts as "staff" for A 1, so it still matches, after the passage holding both words.
    expect(hits.map((h) => h.index)).toEqual([2, 0]);
    expect(index.search('zebra')).toEqual([]);
  });
});

describe('library search', () => {
  it('is off by default and finds a Bible verse once on', async () => {
    const member = await createUser('Library Reader');
    expect((await as(member).get('/library')).json()).toEqual({ enabled: false });
    expect((await as(member).get('/library/search?q=shepherd&collection=bible-kjv')).statusCode).toBe(403);

    await db.query('update public.library_settings set enabled = true');
    expect((await as(member).get('/library')).json()).toMatchObject({ enabled: true, collections: [{ id: 'bible-kjv' }, { id: 'ancient-writings' }] });
    const r = (await as(member).get('/library/search?q=the lord is my shepherd&collection=bible-kjv&limit=3')).json();
    expect(r.hits[0]).toMatchObject({ ref: 'Psalms 23:1', complete: true, work: { title: 'Psalms' } });
    expect(r.hits).toHaveLength(3);
    expect(r.total).toBeGreaterThan(3);

    const rod = (await as(member).get('/library/search?q=rod and staff comfort&collection=bible-kjv&limit=1')).json();
    expect(rod.hits[0].ref).toBe('Psalms 23:4');

    const ancient = (await as(member).get('/library/search?q=Gilgamesh Enkidu&collection=ancient-writings&limit=5')).json();
    expect(ancient.hits.length).toBeGreaterThan(0);
    expect(ancient.hits[0].text).toMatch(/gilgamesh|enkidu/i);
    expect((await as(member).get('/library/search?q=&collection=bible-kjv')).statusCode).toBe(400);
  });

  it('only ships public-domain works', () => {
    for (const id of library.COLLECTIONS) {
      for (const work of library.collection(id).works.values()) expect(work.rights).toBe('public_domain');
    }
    expect([...library.collection('ancient-writings').works.keys()]).not.toContain('ancient-texts-predating-gilgamesh');
  });

  it('never offers the Bible in Open Circle, but offers the ancient writings', async () => {
    const member = await createUser('Library Secular');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
      await c.query('delete from public.community_memberships where user_id = $1', [member]);
      await c.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [member]);
      await c.query('update public.library_settings set enabled = true');
      expect(await library.overview(c, member)).toEqual({ enabled: true, collections: [{ id: 'ancient-writings', title: 'Ancient writings', faith: false }] });
      await expect(library.search(c, member, { q: 'shepherd', collection: 'bible-kjv', offset: 0, limit: 5 })).rejects.toThrow(/not offered/);
      expect((await library.search(c, member, { q: 'virtue', collection: 'ancient-writings', offset: 0, limit: 5 })).hits.length).toBeGreaterThan(0);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('lets only admins change the switch', async () => {
    const member = await createUser('Library Not Admin');
    expect((await as(member).patch('/admin/library', { enabled: true })).statusCode).toBe(403);
  });
});
