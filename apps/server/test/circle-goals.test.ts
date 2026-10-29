// Circle goals: the person who asked sets "N people pray for this by <date>"; progress
// counts different people who really prayed, not the author and not repeat taps.
import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set circle_goals_enabled = false');
  await db.end();
});

describe('Circle goals', () => {
  it('counts different people who prayed toward the goal', async () => {
    const author = await createUser('Goal Author');
    const post = await newRequest(author, 'Pray for our town after the flood.');
    expect((await as(author).get(`/posts/${post.id}/circle-goal`)).json()).toEqual({ enabled: false });
    expect((await as(author).put(`/posts/${post.id}/circle-goal`, { target: 2, days: 7 })).statusCode).toBe(403);

    await db.query('update public.notebook_settings set circle_goals_enabled = true');
    const other = await createUser('Goal Other');
    expect((await as(other).put(`/posts/${post.id}/circle-goal`, { target: 2, days: 7 })).statusCode).toBe(403);
    const set = await as(author).put(`/posts/${post.id}/circle-goal`, { target: 2, days: 7 });
    expect(set.json()).toMatchObject({ enabled: true, canSet: true, goal: { target: 2, prayed: 0, met: false } });

    await as(other).post(`/posts/${post.id}/praying-now`, {});
    await as(other).post(`/posts/${post.id}/praying-now`, {});
    await as(author).post(`/posts/${post.id}/praying-now`, {});
    expect((await as(other).get(`/posts/${post.id}/circle-goal`)).json()).toMatchObject({ canSet: false, goal: { prayed: 1, met: false } });
    const third = await createUser('Goal Third');
    await as(third).post(`/posts/${post.id}/praying-now`, {});
    expect((await as(author).get(`/posts/${post.id}/circle-goal`)).json().goal).toMatchObject({ prayed: 2, met: true });

    expect((await as(author).delete(`/posts/${post.id}/circle-goal`)).json()).toMatchObject({ goal: null });
  });
});
