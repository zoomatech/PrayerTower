// Member-made emoji meanings: members suggest, an admin rewords and approves or
// declines, and an approved meaning joins the tree (in place of a retired one when full).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

const set = (proposals: boolean, meanings = true) =>
  Promise.all([
    db.query('update public.conversation_settings set meaning_proposals_enabled = $1', [proposals]),
    db.query('update public.notebook_settings set meaning_reactions_enabled = $1', [meanings]),
  ]);
const tree = async (u: string) => (await as(u).get('/reaction-meanings')).json().emoji as { key: string; meanings: { key: string; label: string; neutralLabel: string }[] }[];

let admin: string;
beforeAll(async () => {
  await set(false, false);
  admin = await createUser('Meaning Admin');
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
});
afterAll(async () => {
  await set(false, false);
  await db.end();
});

describe('Member-made emoji meanings', () => {
  it('is refused while switched off', async () => {
    const u = await createUser('Proposer Off');
    expect((await as(u).post('/me/meaning-proposals', { emoji: 'love', label: 'You matter' })).statusCode).toBe(400);
    await set(true, false);
    expect((await as(u).post('/me/meaning-proposals', { emoji: 'love', label: 'You matter' })).statusCode).toBe(400);
  });

  it('goes suggest → admin rewords and approves → in the tree; unkind or repeated words are refused', async () => {
    await set(true);
    const u = await createUser('Meaning Proposer');
    expect((await as(u).post('/me/meaning-proposals', { emoji: 'love', label: 'You are an idiot' })).statusCode).toBe(400);
    expect((await as(u).post('/me/meaning-proposals', { emoji: 'nope', label: 'Hello' })).statusCode).toBe(400);
    const love = (await tree(u)).find((e) => e.key === 'love')!;
    expect((await as(u).post('/me/meaning-proposals', { emoji: 'love', label: love.meanings[0]!.label })).statusCode).toBe(409);
    const r = await as(u).post('/me/meaning-proposals', { emoji: 'support', label: 'You are not alone in this' });
    expect(r.statusCode).toBe(201);
    expect(r.json().proposals[0]).toMatchObject({ emoji: 'support', status: 'pending' });

    expect((await as(u).get('/admin/meaning-proposals')).statusCode).toBe(403);
    const waiting = (await as(admin).get('/admin/meaning-proposals')).json().proposals;
    const mine = waiting.find((p: { label: string }) => p.label === 'You are not alone in this');
    expect(mine).not.toHaveProperty('userId');
    const support = (await tree(u)).find((e) => e.key === 'support')!;
    const body = support.meanings.length >= 5 ? { replaces: support.meanings.at(-1)!.key } : {};
    const done = (await as(admin).post(`/admin/meaning-proposals/${mine.id}`, { approve: true, label: 'Not alone in this', neutralLabel: 'Not alone in this', ...body })).json();
    expect(done.status).toBe('approved');
    const after = (await tree(u)).find((e) => e.key === 'support')!;
    expect(after.meanings.length).toBeLessThanOrEqual(5);
    expect(after.meanings.map((m) => m.label)).toContain('Not alone in this');
    expect((await as(u).get('/me/meaning-proposals')).json().proposals[0].status).toBe('approved');
    // Members can choose it like any other meaning.
    expect((await as(admin).post(`/admin/meaning-proposals/${mine.id}`, { approve: true })).statusCode).toBe(404);
  });

  it('asks the admin to retire one when an emoji is full, and can decline', async () => {
    await set(true);
    const u = await createUser('Meaning Full');
    const full = (await tree(u)).find((e) => e.meanings.length === 5);
    if (full) {
      // A label of its own each run: the test database keeps earlier runs' proposals, and a repeat is refused.
      const label = `So glad for you ${Date.now() % 100000}`;
      await as(u).post('/me/meaning-proposals', { emoji: full.key, label });
      const p = (await as(admin).get('/admin/meaning-proposals')).json().proposals.find((x: { label: string }) => x.label === label);
      expect((await as(admin).post(`/admin/meaning-proposals/${p.id}`, { approve: true })).statusCode).toBe(409);
      expect((await as(admin).post(`/admin/meaning-proposals/${p.id}`, { approve: false })).json().status).toBe('declined');
    }
    for (let i = 0; i < 5; i++) await as(u).post('/me/meaning-proposals', { emoji: 'celebrate', label: `Hooray number ${i}` });
    expect((await as(u).post('/me/meaning-proposals', { emoji: 'celebrate', label: 'One more hooray' })).statusCode).toBe(409);
  });
});
