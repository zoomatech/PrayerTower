import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { cards } from '../src/modules/posts/index.js';
import { awardBonus, gift } from '../src/modules/tokens/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('vine scripture leaves', () => {
  it('serves the active leaves, and only admins can change them', async () => {
    const member = await createUser('Vine Reader');
    const admin = await createUser('Vine Gardener');
    await grantRole(db, admin, 'admin', null);
    const leaves = (await as(member).get('/scripture-leaves')).json().leaves as { id: string; reference: string }[];
    expect(leaves.some((l) => l.reference === 'John 15:5')).toBe(true);

    expect((await as(member).post('/admin/scripture-leaves', { reference: 'Ps 1:3', text: 'x' })).statusCode).toBe(403);
    const created = await as(admin).post('/admin/scripture-leaves', { reference: 'Psalm 1:3', text: 'And he shall be like a tree planted by the rivers of water.', translation: 'KJV' });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(((await as(member).get('/scripture-leaves')).json().leaves as { id: string }[]).some((l) => l.id === id)).toBe(true);
    await as(admin).patch(`/admin/scripture-leaves/${id}`, { active: false });
    expect(((await as(member).get('/scripture-leaves')).json().leaves as { id: string }[]).some((l) => l.id === id)).toBe(false);
  });
});

describe('fruit on the vine', () => {
  it('marks a post once someone has gifted its poster tokens, regular or Priestly', async () => {
    const poster = await createUser('Vine Fruit Poster');
    const other = await createUser('Vine Fruit Other');
    const giver = await createUser('Vine Fruit Giver');
    const a = (await as(poster).post('/posts', { postType: 'prayer_request', body: 'Pray for my garden to grow this spring.' })).json().post.id as string;
    const b = (await as(other).post('/posts', { postType: 'prayer_request', body: 'Pray for my new job interview on Monday.' })).json().post.id as string;
    const gifted = async () => Object.fromEntries((await cards(db, [a, b], giver)).map((c) => [c.id, c.gifted]));
    expect(await gifted()).toEqual({ [a]: false, [b]: false });
    await awardBonus(db, giver, `fruit-${giver}`, 1, 'priestly');
    await gift(db, giver, poster, 1, 'fruit-priestly', 'priestly');
    expect(await gifted()).toEqual({ [a]: true, [b]: false });
    await awardBonus(db, giver, `fruit-r-${giver}`, 1);
    await gift(db, giver, other, 1, 'fruit-regular');
    expect(await gifted()).toEqual({ [a]: true, [b]: true });
  });
});
