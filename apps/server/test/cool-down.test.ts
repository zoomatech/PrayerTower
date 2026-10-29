// Cool-down: three flagged replies between the same two members within a day offer
// both a pause card. The replies always post; only who replied to whom is kept.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set cool_down_enabled = $1', [v]);
const HOT = 'You are an idiot and you know it.';

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

async function pair() {
  const [a, b] = [await createUser('Cool A'), await createUser('Cool B')];
  const post = await newRequest(a);
  const first = (await as(a).post(`/posts/${post.id}/comments`, { body: 'Thank you all.' })).json().comment.id as string;
  return { a, b, postId: post.id, first };
}

describe('Cool-down', () => {
  it('offers both a pause card after three heated replies, and never blocks one', async () => {
    await on(true);
    const { a, b, postId, first } = await pair();
    const r1 = await as(b).post(`/posts/${postId}/comments`, { body: HOT, parentId: first });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().coolDown).toBeUndefined();
    const c1 = r1.json().comment.id as string;
    expect((await as(a).post(`/posts/${postId}/comments`, { body: 'Shut up, you fool.', parentId: c1 })).statusCode).toBe(201);
    // A kind reply doesn't count.
    await as(b).post(`/posts/${postId}/comments`, { body: 'Praying for you anyway.' });
    expect((await as(a).get('/me/cool-down')).json().coolDown).toBeNull();
    const r3 = await as(b).post(`/posts/${postId}/comments`, { body: 'What a pathetic loser you are.' });
    expect(r3.statusCode).toBe(201);
    expect(r3.json().coolDown).toBe(true);

    const forA = (await as(a).get('/me/cool-down')).json().coolDown;
    const forB = (await as(b).get('/me/cool-down')).json().coolDown;
    expect(forA.id).toBe(forB.id);
    expect(forA.line).toBeGreaterThanOrEqual(0);
    // Nothing of what was said is kept.
    const { rows } = await db.query('select * from public.heated_replies where from_id = $1 or to_id = $1', [a]);
    expect(Object.keys(rows[0]!).sort()).toEqual(['created_at', 'from_id', 'id', 'to_id']);

    await as(a).post(`/me/cool-down/${forA.id}`, { choice: 'breather' });
    expect((await as(a).get('/me/cool-down')).json().coolDown).toBeNull();
    expect((await as(b).get('/me/cool-down')).json().coolDown.id).toBe(forB.id);
    // Only once a day for the same two.
    await as(a).post(`/posts/${postId}/comments`, { body: 'You stupid clown.', parentId: c1 });
    expect((await as(a).get('/me/cool-down')).json().coolDown).toBeNull();
    // Someone else can't answer it.
    await as(await createUser('Cool Stranger')).post(`/me/cool-down/${forB.id}`, { choice: 'okay' });
    expect((await as(b).get('/me/cool-down')).json().coolDown).not.toBeNull();
  });

  it('counts nothing while switched off', async () => {
    await on(false);
    const { a, b, postId, first } = await pair();
    for (let i = 0; i < 3; i++) await as(b).post(`/posts/${postId}/comments`, { body: `${HOT} (${i})`, parentId: first });
    expect((await db.query('select 1 from public.heated_replies where from_id = $1', [b])).rowCount).toBe(0);
    expect((await as(a).get('/me/cool-down')).json().coolDown).toBeNull();
  });

  it('counts heated messages in a one-to-one conversation', async () => {
    await on(true);
    const [a, b] = [await createUser('Cool Msg A'), await createUser('Cool Msg B')];
    await as(a).put(`/people/${b}/follow`);
    await as(b).put(`/people/${a}/follow`);
    const convo = (await as(a).post('/conversations/direct', { userId: b, body: 'Hello there.' })).json().conversationId;
    await as(b).post(`/conversations/${convo}/accept`);
    await as(a).post(`/conversations/${convo}/messages`, { body: HOT });
    await as(b).post(`/conversations/${convo}/messages`, { body: 'You are pathetic.' });
    const r = await as(a).post(`/conversations/${convo}/messages`, { body: 'Screw you.' });
    expect(r.statusCode).toBe(201);
    expect(r.json().coolDown).toBe(true);
    expect((await as(b).get('/me/cool-down')).json().coolDown).not.toBeNull();
  });
});
