// Goldfish memory: the moderation queue shows each author's recent removals, old ones fade,
// serious harms never fade, and a repeat count quietly tells the admins. Off by default.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.moderation_tool_settings set goldfish_enabled = $1, goldfish_days = 90, goldfish_repeat = 3', [v]);
let mod: string;
let admin: string;

beforeAll(async () => {
  await on(false);
  mod = await createUser('Goldfish Mod');
  await grantRole(db, mod, 'moderator', null);
  admin = await createUser('Goldfish Admin');
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
});
afterAll(async () => {
  await on(false);
  await db.end();
});

async function report(poster: string, words: string) {
  const reporter = await createUser('Goldfish Reporter');
  const post = await newRequest(poster, words);
  await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Unkind' });
  return (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items[0] as { id: string; history?: { recent: number; serious: number; days: number; repeat: boolean } };
}
const remove = async (id: string, rule: string) => expect((await as(mod).post(`/moderation/items/${id}/decision`, { action: 'remove', rule })).statusCode).toBe(200);
const repeatNotes = async (who: string) =>
  (await db.query("select 1 from public.notifications where user_id = $1 and kind = 'moderation_repeat' and data ->> 'userId' = $2", [admin, who])).rowCount;

describe('Goldfish memory', () => {
  it('shows no history while off', async () => {
    const poster = await createUser('Goldfish Off');
    expect((await report(poster, 'Pray for my noisy neighbour, honestly.')).history).toBeUndefined();
    expect((await as(poster).get('/features')).json().features.goldfishMemory).toBe(false);
  });

  it('counts recent removals, lets old ones fade, and never fades serious harms', async () => {
    await on(true);
    const poster = await createUser('Goldfish Poster');
    const first = await report(poster, 'Pray for my coworker, what a clown.');
    expect(first.history).toEqual({ recent: 0, serious: 0, days: 90, repeat: false });
    await remove(first.id, 'abuse');
    const second = await report(poster, 'Pray for my landlord, what a clown.');
    expect(second.history?.recent).toBe(1);
    await remove(second.id, 'harm');
    // An old removal fades: move the first one back past the window.
    await db.query("update public.moderation_items set decided_at = now() - interval '120 days' where id = $1", [first.id]);
    const third = await report(poster, 'Pray for my boss, what a clown.');
    expect(third.history).toMatchObject({ recent: 0, serious: 1 });
    await db.query("update public.moderation_items set decided_at = now() - interval '400 days' where id = $1", [second.id]);
    expect((await report(poster, 'Pray for my uncle, what a clown.')).history?.serious).toBe(1);
  });

  it('quietly tells the admins once when someone reaches the repeat count', async () => {
    await on(true);
    const poster = await createUser('Goldfish Repeat');
    for (let i = 0; i < 2; i++) await remove((await report(poster, `Pray for my cousin number ${i}, a real clown.`)).id, 'abuse');
    expect(await repeatNotes(poster)).toBe(0);
    const third = await report(poster, 'Pray for my cousin number 3, a real clown.');
    expect(third.history).toMatchObject({ recent: 2, repeat: false });
    await remove(third.id, 'abuse');
    expect(await repeatNotes(poster)).toBe(1);
    await remove((await report(poster, 'Pray for my cousin number 4, a real clown.')).id, 'abuse');
    expect(await repeatNotes(poster)).toBe(1);
    expect((await report(poster, 'Pray for my cousin number 5, a real clown.')).history?.repeat).toBe(true);
  });

  it('lets only admins change the settings', async () => {
    expect((await as(mod).patch('/admin/goldfish', { days: 30 })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/goldfish', { days: 30, repeat: 4 })).json().settings).toMatchObject({ goldfish_days: 30, goldfish_repeat: 4 });
    expect((await as(admin).patch('/admin/goldfish', { days: 5 })).statusCode).toBe(400);
  });
});
