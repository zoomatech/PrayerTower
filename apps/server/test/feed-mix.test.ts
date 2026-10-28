import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('Pick Your Prayer Mix', () => {
  it('saves a member\'s mix and refuses unknown keys or levels', async () => {
    const member = await createUser('Mixer');
    const res = await as(member).patch('/me', { feedMix: { 'type:praise': 'more', 'realm:world': 'less' } });
    expect(res.statusCode).toBe(200);
    expect((await as(member).get('/me')).json().profile.feed_mix).toEqual({ 'type:praise': 'more', 'realm:world': 'less' });
    expect((await as(member).patch('/me', { feedMix: { 'type:ads': 'more' } })).statusCode).toBe(400);
    expect((await as(member).patch('/me', { feedMix: { 'type:praise': 'none' } })).statusCode).toBe(400);
    // The feed still shows everything; the mix only reorders it.
    expect((await as(member).get('/feed')).statusCode).toBe(200);
  });
});
