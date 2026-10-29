// Comments at block breaks (notebook Page 13): a comment can be about one ~200-word part
// of a long post. Off by default: while off, a part is ignored and comments work as before.
import { postParts } from '@prayer-tower/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.conversation_settings set part_comments_enabled = $1', [v]);
const sentence = (i: number) => `Day ${i} we sat in the waiting room and asked friends to keep us in their hearts.`; // 17 words
const LONG = Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(' '); // 510 words

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('postParts', () => {
  it('keeps a short post whole', () => {
    expect(postParts('Please pray for my mother.')).toEqual(['Please pray for my mother.']);
  });

  it('cuts a long post into parts of about 200 words, at sentence ends, losing no words', () => {
    const parts = postParts(LONG);
    expect(parts).toHaveLength(3);
    for (const p of parts.slice(0, -1)) {
      const n = p.split(/\s+/).length;
      expect(n).toBeGreaterThan(150);
      expect(n).toBeLessThanOrEqual(200);
      expect(p.endsWith('.')).toBe(true);
    }
    expect(parts.join(' ')).toBe(LONG);
  });

  it('prefers a paragraph break near the mark', () => {
    const para = Array.from({ length: 10 }, (_, i) => sentence(i)).join(' '); // 170 words
    const body = `${para}\n\n${para}\n\n${para}`;
    const parts = postParts(body);
    expect(parts[0]).toBe(para);
    expect(parts.length).toBe(3);
  });

  it('cuts mid-sentence only when no sentence ends near the mark', () => {
    const run = Array.from({ length: 450 }, () => 'word').join(' ');
    expect(postParts(run).map((p) => p.split(' ').length)).toEqual([200, 200, 50]);
  });
});

describe('Comments at block breaks', () => {
  it('ignores a part while off', async () => {
    const [u, other] = [await createUser('Part Off'), await createUser('Part Off Reader')];
    const p = await newRequest(u, LONG);
    expect((await as(other).post(`/posts/${p.id}/comments`, { body: 'Praying for you.', part: 1 })).statusCode).toBe(201);
    const { comments } = (await as(other).get(`/posts/${p.id}/comments`)).json();
    expect(comments[0]).toMatchObject({ body: 'Praying for you.', part: null });
  });

  it('keeps the part with the comment, and refuses a part the post does not have', async () => {
    await on(true);
    const [u, other] = [await createUser('Part Asker'), await createUser('Part Reader')];
    const p = await newRequest(u, LONG);
    expect((await as(other).post(`/posts/${p.id}/comments`, { body: 'That second day sounds so hard.', part: 1 })).statusCode).toBe(201);
    expect((await as(other).post(`/posts/${p.id}/comments`, { body: 'Praying.', part: 3 })).statusCode).toBe(400);
    const short = await newRequest(u);
    expect((await as(other).post(`/posts/${short.id}/comments`, { body: 'Praying.', part: 1 })).statusCode).toBe(400);

    const { comments } = (await as(other).get(`/posts/${p.id}/comments`)).json();
    expect(comments[0]).toMatchObject({ body: 'That second day sounds so hard.', part: 1 });
    // Replies and updates belong to the whole thread, not a part.
    expect((await as(u).post(`/posts/${p.id}/comments`, { body: 'Thank you.', parentId: comments[0].id, part: 1 })).statusCode).toBe(400);
    expect((await as(u).post(`/posts/${p.id}/comments`, { body: 'Home now.', isUpdate: true, part: 0 })).statusCode).toBe(400);
    expect((await as(u).get('/features')).json().features.partComments).toBe(true);
  });
});
