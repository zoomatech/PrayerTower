// Moderation tools (Admin → Moderation tools, off): search waiting reports and
// past decisions, decide several at once (never someone who may be in danger, never
// a suspension), and filter the staff audit log.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { flagCrisis } from '../src/modules/moderation/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

let admin: string;
let mod: string;
const tag = `zq${Date.now().toString(36)}`;

beforeAll(async () => {
  admin = await createUser('Tools Admin');
  await grantRole(db, admin, 'admin', null);
  mod = await createUser('Tools Mod');
  await grantRole(db, mod, 'moderator', null);
});
afterAll(async () => {
  await db.query('update public.moderation_tool_settings set tools_enabled = false, bulk_max = 25');
  await db.end();
});

async function reported(poster: string, words: string) {
  const reporter = await createUser('Tools Reporter');
  const post = await newRequest(poster, `${words} ${tag}`);
  await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: `Looks like spam ${tag}` });
  return { post, item: (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items[0].id as string };
}

describe('moderation tools', () => {
  it('are off until an admin turns them on', async () => {
    expect((await as(mod).get('/moderation/search')).statusCode).toBe(403);
    expect((await as(mod).post('/moderation/items/bulk', { ids: [admin], action: 'dismiss' })).statusCode).toBe(403);
    expect((await as(admin).get('/admin/audit-log?q=anything')).statusCode).toBe(403);
    expect((await as(mod).patch('/admin/moderation-tools', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/moderation-tools', { bulkMax: 1 })).statusCode).toBe(400);
    const on = await as(admin).patch('/admin/moderation-tools', { enabled: true, bulkMax: 3 });
    expect(on.json().settings).toEqual({ tools_enabled: true, bulk_max: 3 });
    expect((await as(admin).get('/features')).json().features.moderationTools).toBe(true);
  });

  it('searches waiting reports by words and name, then past decisions', async () => {
    const poster = await createUser(`Searchable ${tag}`);
    const a = await reported(poster, 'Pray for my garden of turnips');
    await reported(poster, 'Pray for my old truck');
    const turnips = (await as(mod).get(`/moderation/search?q=turnips ${tag}`)).json().items;
    expect(turnips.map((i: { id: string }) => i.id)).toEqual([a.item]);
    expect(turnips[0].author_name).toBe(`Searchable ${tag}`);
    // A literal % is not a wildcard.
    expect((await as(mod).get(`/moderation/search?q=${encodeURIComponent(`%${tag}`)}`)).json().items).toEqual([]);
    expect((await as(mod).get(`/moderation/search?q=Searchable ${tag}&source=report`)).json().items).toHaveLength(2);
    expect((await as(mod).get(`/moderation/search?q=${tag}&source=ai`)).json().items).toHaveLength(0);

    await as(mod).post(`/moderation/items/${a.item}/decision`, { action: 'dismiss' });
    const decided = (await as(mod).get(`/moderation/search?status=decided&q=turnips ${tag}`)).json().items;
    expect(decided[0]).toMatchObject({ id: a.item, status: 'dismissed', decided_by_name: 'Tools Mod' });
    expect((await as(mod).get(`/moderation/search?q=turnips ${tag}`)).json().items).toEqual([]);
  });

  it('decides several at once, leaving out anyone who may be in danger and anything already decided', async () => {
    const poster = await createUser('Bulk Poster');
    const one = await reported(poster, 'Buy shirts here');
    const two = await reported(poster, 'Buy candles here');
    const danger = await newRequest(poster, `I want to end it all ${tag}`);
    await flagCrisis(db, 'post', danger.id);
    const crisis = (await as(mod).get(`/moderation/queue?targetId=${danger.id}`)).json().items.find((i: { source: string }) => i.source === 'crisis').id;

    expect((await as(mod).post('/moderation/items/bulk', { ids: [one.item, two.item, crisis, admin], action: 'remove' })).statusCode).toBe(400);
    const r = (await as(mod).post('/moderation/items/bulk', { ids: [one.item, two.item, crisis], action: 'remove', rule: 'ads' })).json();
    expect(r.decided).toEqual([one.item, two.item]);
    expect(r.skipped).toEqual([{ id: crisis, reason: expect.stringMatching(/danger/) }]);
    const { rows } = await db.query(`select moderation_status from public.posts where id = any($1::uuid[]) order by created_at`, [[one.post.id, two.post.id]]);
    expect(rows.map((x) => x.moderation_status)).toEqual(['removed', 'removed']);
    expect((await db.query('select suspended_until from public.profiles where id = $1', [poster])).rows[0].suspended_until).toBeNull();
    expect((await db.query(`select status from public.moderation_items where id = $1`, [crisis])).rows[0].status).toBe('pending');

    const again = (await as(mod).post('/moderation/items/bulk', { ids: [one.item], action: 'dismiss' })).json();
    expect(again).toEqual({ decided: [], skipped: [{ id: one.item, reason: 'This item was already decided' }] });
    // Every bulk decision is in the audit log, and each item keeps its own logged action.
    expect((await db.query(`select note from public.moderation_actions where moderation_item_id = $1`, [one.item])).rows[0].note).toBe('Bulk decision (3 selected)');
  });

  it('filters the audit log by words, moderation only, and time', async () => {
    const all = (await as(admin).get('/admin/audit-log?action=%20/moderation/&limit=200')).json().entries;
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e: { action: string }) => e.action.includes(' /moderation/'))).toBe(true);
    expect(all.some((e: { action: string }) => e.action === 'POST /moderation/items/bulk')).toBe(true);
    const named = (await as(admin).get(`/admin/audit-log?q=Tools Mod`)).json().entries;
    expect(named.length).toBeGreaterThan(0);
    expect(named.every((e: { actor_name: string }) => e.actor_name === 'Tools Mod')).toBe(true);
    const future = new Date(Date.now() + 60_000).toISOString();
    expect((await as(admin).get(`/admin/audit-log?since=${encodeURIComponent(future)}`)).json().entries).toEqual([]);
  });
});
