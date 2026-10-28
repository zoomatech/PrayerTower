import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db } from './helpers.js';

const made: string[] = [];
afterAll(async () => {
  await db.query('update public.macro_needs set ended_at = now() where id = any($1)', [made]);
  await db.end();
});

describe('macro needs', () => {
  it('lets staff feature a need with prayer and material-help options, outside the regular feed', async () => {
    const mod = await createUser('Relief Moderator');
    await grantRole(db, mod, 'moderator', null);
    const member = await createUser('Neighbor');
    const input = {
      title: 'Hurricane relief',
      body: 'Pray for the families who lost their homes in the hurricane.',
      helpOptions: [{ label: 'Red Cross', url: 'https://www.redcross.org/donate' }],
    };
    expect((await as(member).post('/macro-needs', input)).statusCode).toBe(403);
    expect((await as(mod).post('/macro-needs', { ...input, helpOptions: [{ label: 'x', url: 'http://insecure.example' }] })).statusCode).toBe(400);
    const res = await as(mod).post('/macro-needs', input);
    expect(res.statusCode).toBe(201);
    const { id, postId } = res.json();
    made.push(id);

    await as(member).post(`/posts/${postId}/praying-now`);
    await tokens.earn(db, member, 3, `t:${member}:macro`, 'test');
    await as(member).post(`/posts/${postId}/boost`, { amount: 3, idempotencyKey: 'macro' });
    expect((await as(member).post(`/macro-needs/${id}/helped`)).json().helpers).toBe(1);
    expect((await as(member).post(`/macro-needs/${id}/helped`)).json().helpers).toBe(1);

    const need = (await as(member).get('/macro-needs')).json().needs.find((n: { id: string }) => n.id === id);
    expect(need).toMatchObject({ title: 'Hurricane relief', helpOptions: input.helpOptions, prayers: 1, tokens: 3, helpers: 1, helped: true });
    expect(need.card.id).toBe(postId);

    // Not repeated in the feed while featured.
    const feed = (await as(member).get('/feed')).json();
    expect(feed.posts.some((p: { id: string }) => p.id === postId)).toBe(false);

    expect((await as(member).post(`/macro-needs/${id}/end`)).statusCode).toBe(403);
    expect((await as(mod).post(`/macro-needs/${id}/end`)).statusCode).toBe(200);
    expect((await as(member).get('/macro-needs')).json().needs.some((n: { id: string }) => n.id === id)).toBe(false);
  });
});
