import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
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
