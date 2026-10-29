// Calm threads: three flagged comments from two people within two hours make the thread
// "warm" for everyone and put it before a moderator. Nothing is limited until a
// moderator chooses to slow it; then it's one comment every 10 minutes per person.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set calm_threads_enabled = $1', [v]);
// Words the kind cloud flags as aimed at someone.
const heated = (n: number) => `You are an idiot and you are wrong ${n}`;

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

async function heatUp() {
  const [asker, a, b] = [await createUser('Calm Asker'), await createUser('Calm A'), await createUser('Calm B')];
  const post = await newRequest(asker);
  await as(a).post(`/posts/${post.id}/comments`, { body: heated(1) });
  await as(b).post(`/posts/${post.id}/comments`, { body: heated(2) });
  await as(a).post(`/posts/${post.id}/comments`, { body: heated(3) });
  return { asker, a, b, post };
}

describe('Calm threads', () => {
  it('does nothing while off', async () => {
    const t = await heatUp();
    expect((await as(t.asker).get(`/posts/${t.post.id}/calm`)).json()).toEqual({ enabled: false, calm: null });
  });

  it('warms a heated thread for everyone and queues it for a person, without blocking', async () => {
    await on(true);
    const mod = await createUser('Calm Moderator');
    await grantRole(db, mod, 'moderator', null);
    const t = await heatUp();
    expect((await as(t.asker).get(`/posts/${t.post.id}/calm`)).json()).toEqual({ enabled: true, calm: { kind: 'warm' } });
    expect((await as(t.a).post(`/posts/${t.post.id}/comments`, { body: 'Sorry, that came out wrong.' })).statusCode).toBe(201);
    expect((await as(t.a).get('/moderation/calm-threads')).statusCode).toBe(403);
    const queue = (await as(mod).get('/moderation/calm-threads')).json().threads;
    const mine = queue.find((q: { postId: string }) => q.postId === t.post.id);
    expect(mine).toMatchObject({ heated: 3, people: 2 });
    expect(JSON.stringify(mine)).not.toContain('idiot');
  });

  it('slows the thread only when a moderator says so', async () => {
    await on(true);
    const mod = await createUser('Calm Moderator 2');
    await grantRole(db, mod, 'moderator', null);
    const t = await heatUp();
    const r = await as(mod).post(`/moderation/calm-threads/${t.post.id}`, { action: 'slow', hours: 2 });
    expect(r.json().calm).toMatchObject({ kind: 'slow', minutes: 10 });
    const again = await as(t.a).post(`/posts/${t.post.id}/comments`, { body: 'One more thought.' });
    expect(again.statusCode).toBe(429);
    expect(again.json().message).toMatch(/taking it slow/);
    expect((await as(t.asker).post(`/posts/${t.post.id}/comments`, { body: 'Thank you all for caring.' })).statusCode).toBe(201);
    await as(mod).post(`/moderation/calm-threads/${t.post.id}`, { action: 'settle' });
    expect((await as(t.a).post(`/posts/${t.post.id}/comments`, { body: 'Thanks for listening.' })).statusCode).toBe(201);
  });
});
