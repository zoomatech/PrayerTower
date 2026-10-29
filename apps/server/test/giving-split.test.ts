// Giving split: a member may ask that a share of gifts toward them go to their own page.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as split from '../src/modules/giving-split/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

let admin: string;
const page = (id: string, url = 'https://ko-fi.com/carolsings') => db.query('update public.profiles set support_url = $2 where id = $1', [id, url]);

beforeEach(async () => {
  admin ??= await createUser('Split Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/giving-split-settings', { enabled: true, maxPercent: 50 });
});

afterAll(async () => {
  await split.updateSettings(db, { enabled: false, maxPercent: 50 });
  await db.end();
});

describe('giving split', () => {
  it('is off by default and only admins switch it', async () => {
    await as(admin).patch('/admin/giving-split-settings', { enabled: false });
    const member = await createUser('Split Off');
    await page(member);
    expect((await as(member).get('/features')).json().features.givingSplit).toBe(false);
    expect((await as(member).put('/me/giving-split', { percent: 20 })).statusCode).toBe(403);
    expect((await as(member).patch('/admin/giving-split-settings', { enabled: true })).statusCode).toBe(403);
    const giver = await createUser('Split Giver Off');
    expect((await as(giver).get(`/people/${member}/giving-split?cents=1000`)).json().split).toBeNull();
  });

  it('needs the member’s own page and stays within the limit', async () => {
    const member = await createUser('Split Pageless');
    expect((await as(member).put('/me/giving-split', { percent: 20 })).statusCode).toBe(400);
    await page(member);
    expect((await as(member).put('/me/giving-split', { percent: 60 })).statusCode).toBe(400);
    expect((await as(member).put('/me/giving-split', { percent: 20 })).json().split).toMatchObject({ percent: 20, maxPercent: 50 });
    // Lowering the limit lowers anyone above it.
    await as(admin).patch('/admin/giving-split-settings', { maxPercent: 10 });
    expect((await as(member).get('/me/giving-split')).json().split.percent).toBe(10);
  });

  it('shows the giver the page and the share of their gift', async () => {
    const member = await createUser('Carol Split');
    const giver = await createUser('Gina Giver');
    await page(member);
    await as(member).put('/me/giving-split', { percent: 20 });
    expect((await as(giver).get(`/people/${member}/giving-split?cents=1000`)).json().split).toEqual({ url: 'https://ko-fi.com/carolsings', percent: 20, shareCents: 200 });
    expect((await as(member).get(`/people/${member}/giving-split`)).json().split).toBeNull();
    // Blocked either way: nothing.
    await as(member).put(`/people/${giver}/block`);
    expect((await as(giver).get(`/people/${member}/giving-split?cents=1000`)).json().split).toBeNull();
  });

  it('shows the split for a gift on a post, but never for an anonymous one', async () => {
    const member = await createUser('Post Splitter');
    const giver = await createUser('Post Giver');
    await page(member, 'https://www.zeffy.com/en-US/donation-form/abc');
    await as(member).put('/me/giving-split', { percent: 30 });
    const named = await newRequest(member);
    const hidden = await newRequest(member, 'Please pray quietly for me.', { isAnonymous: true });
    expect((await as(giver).get(`/posts/${named.id}/giving-split`)).json().split).toMatchObject({ percent: 30, shareCents: null });
    expect((await as(giver).get(`/posts/${hidden.id}/giving-split`)).json().split).toBeNull();
  });
});
