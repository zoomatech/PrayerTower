// A path back after a removal: the notice says the author can post again with changes, and
// only the author gets their own removed words back. Never for threats or flooding.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set path_back_enabled = $1', [v]);
let mod: string;

beforeAll(async () => {
  await on(false);
  mod = await createUser('Path Mod');
  await grantRole(db, mod, 'moderator', null);
});
afterAll(async () => {
  await on(false);
  await db.end();
});

async function removed(words: string, rule: string) {
  const [poster, reporter] = [await createUser('Path Poster'), await createUser('Path Reporter')];
  const post = await newRequest(poster, words);
  await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Unkind' });
  const item = (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items[0].id as string;
  expect((await as(mod).post(`/moderation/items/${item}/decision`, { action: 'remove', rule })).statusCode).toBe(200);
  const { rows } = await db.query<{ body: string; data: { pathBack?: boolean } }>("select body, data from public.notifications where user_id = $1 and kind = 'moderation_notice'", [poster]);
  return { poster, reporter, item, notice: rows[0]! };
}

describe('Path back', () => {
  it('stays quiet while off', async () => {
    const r = await removed('Please pray for my brother, who is being a total idiot.', 'abuse');
    expect(r.notice.data.pathBack).toBeUndefined();
    expect(r.notice.body).not.toContain('post it again');
    expect((await as(r.poster).get(`/me/removed/${r.item}`)).statusCode).toBe(400);
  });

  it('offers the author their own words back, and nobody else', async () => {
    await on(true);
    const words = 'Please pray for my brother, who is being a total idiot about his health.';
    const r = await removed(words, 'abuse');
    expect(r.notice.data.pathBack).toBe(true);
    expect(r.notice.body).toContain('post it again with changes');
    expect((await as(r.poster).get(`/me/removed/${r.item}`)).json()).toEqual({ target: 'post', body: words, postType: 'prayer_request' });
    expect((await as(r.reporter).get(`/me/removed/${r.item}`)).statusCode).toBe(404);
  });

  it('is never offered for a prayer for harm', async () => {
    await on(true);
    const r = await removed('Please pray that my neighbour gets what is coming.', 'harm');
    expect(r.notice.data.pathBack).toBeUndefined();
    expect((await as(r.poster).get(`/me/removed/${r.item}`)).statusCode).toBe(404);
  });
});
