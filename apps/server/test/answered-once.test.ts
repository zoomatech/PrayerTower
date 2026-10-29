// Two "answered" taps at the same moment mark the request once and tell each pray-er once.
import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('marking a request answered', () => {
  it('happens once, even when sent several times at once', async () => {
    const poster = await createUser('Answered Twice Poster');
    const prayer = await createUser('Answered Twice Prayer');
    const post = await newRequest(poster, 'Pray for my job interview on Friday, please.');
    expect((await as(prayer).post(`/posts/${post.id}/praying-now`, {})).statusCode).toBe(201);
    const results = await Promise.all(Array.from({ length: 5 }, () => as(poster).post(`/posts/${post.id}/answered`, {})));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400, 400, 400, 400]);
    const { rows } = await db.query(`select count(*)::int as n from public.notifications where user_id = $1 and data->>'postId' = $2 and kind like '%answer%'`, [prayer, post.id]);
    expect(rows[0].n).toBe(1);
  });
});
