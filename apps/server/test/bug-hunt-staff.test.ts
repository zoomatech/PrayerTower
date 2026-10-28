// Regression tests for the staff, admin and radio bug hunt (2026-10-28).
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole, revokeRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

const tokenDefaults = await tokens.settings(db);
afterAll(async () => {
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

describe('radio prayers', () => {
  it('never transmit a removed request, and give the Priestly token back', async () => {
    await tokens.updateSettings(db, { priestly_prayers_per_token: 1, verified_prayer_min_gap_seconds: 0, radio_funding: 'tokens', radio_prayer_cost: 1 });
    const asker = await createUser('Radio Removed Asker');
    const sender = await createUser('Radio Refund Sender');
    const post = await newRequest(asker, 'Please pray for the harvest.');
    await as(sender).post(`/posts/${post.id}/praying-now`);
    await drainJobs();
    expect(await tokens.balanceOf(db, sender, 'priestly')).toBe(1);

    const queued = await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: 'refund-1' });
    expect(queued.statusCode).toBe(201);
    expect(await tokens.balanceOf(db, sender, 'priestly')).toBe(0);
    await db.query(`update public.posts set moderation_status = 'removed' where id = $1`, [post.id]);
    await drainJobs();

    const { rows } = await db.query('select status, error from public.radio_prayers where id = $1', [queued.json().radioPrayer.id]);
    expect(rows[0]).toEqual({ status: 'failed', error: 'not sent: request removed or hidden' });
    expect(await tokens.balanceOf(db, sender, 'priestly')).toBe(1);
    expect((await db.query('select count(*)::int as n from public.token_ledger_audit')).rows[0].n).toBe(0);
    // The sender is told, without the reason (it names a moderator's decision).
    const told = (await as(sender).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind === 'radio_not_sent');
    expect(told).toHaveLength(1);
    expect(told[0].body).toBe('Your Priestly token is back in your balance.');
    expect(JSON.stringify(told[0])).not.toMatch(/removed/);
  });

  it('cannot be sent for someone who blocked you', async () => {
    const asker = await createUser('Radio Blocker');
    const pest = await createUser('Radio Pest');
    const post = await newRequest(asker, 'Pray for my family.');
    await as(asker).put(`/people/${pest}/block`);
    expect((await as(pest).post(`/posts/${post.id}/radio`, { idempotencyKey: 'blocked-1' })).statusCode).toBe(404);
  });
});

describe('moderation', () => {
  it('stops a moderator deciding reports about their own posts or their own appeal', async () => {
    const mod = await createUser('Self Mod');
    const other = await createUser('Other Mod');
    const reporter = await createUser('Self Mod Reporter');
    await grantRole(db, mod, 'moderator', null);
    await grantRole(db, other, 'moderator', null);
    const post = await newRequest(mod, 'Pray for my week.');
    await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Spam' });
    const [item] = (await as(other).get(`/moderation/queue?targetId=${post.id}`)).json().items;
    expect((await as(mod).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss' })).statusCode).toBe(403);

    expect((await as(other).post(`/moderation/items/${item.id}/decision`, { action: 'remove', rule: 'ads' })).statusCode).toBe(200);
    const appeal = await as(mod).post(`/moderation/items/${item.id}/appeal`, { message: 'It was a real request.' });
    expect((await as(mod).post(`/moderation/appeals/${appeal.json().appealId}/decision`, { action: 'overturn' })).statusCode).toBe(403);
  });

  it('gives back forfeited tokens when an appeal is overturned', async () => {
    const member = await createUser('Forfeit Member');
    const reporter = await createUser('Forfeit Reporter');
    const mod = await createUser('Forfeit Mod');
    await grantRole(db, mod, 'moderator', null);
    await tokens.earn(db, member, 3, `bug-hunt-earn:${member}`, 'test');
    const post = await newRequest(member, 'Pray for my job search.');
    await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Looks like an ad' });
    const [item] = (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items;
    await as(mod).post(`/moderation/items/${item.id}/decision`, { action: 'remove', rule: 'ads', forfeitTokens: 'all' });
    expect(await tokens.balanceOf(db, member)).toBe(0);

    const appeal = await as(member).post(`/moderation/items/${item.id}/appeal`, { message: 'Not an ad.' });
    expect((await as(mod).post(`/moderation/appeals/${appeal.json().appealId}/decision`, { action: 'overturn' })).statusCode).toBe(200);
    expect(await tokens.balanceOf(db, member)).toBe(3);
  });
});

describe('admin roles', () => {
  it('refuses to remove the last admin, and to give roles to deleted members', async () => {
    const solo = await createUser('Solo Admin');
    await grantRole(db, solo, 'admin', null);
    // In a transaction that is rolled back, so other tests keep their admins.
    const tx = await db.connect();
    try {
      await tx.query('begin');
      await tx.query(`delete from public.user_roles where role = 'admin' and user_id <> $1`, [solo]);
      await expect(revokeRole(tx, solo, 'admin')).rejects.toThrow(/last admin/);
    } finally {
      await tx.query('rollback');
      tx.release();
    }
    // With other admins it works.
    expect((await as(solo).inject('DELETE', `/admin/people/${solo}/roles/admin`, {})).statusCode).toBe(200);

    const admin = await createUser('Role Admin');
    await grantRole(db, admin, 'admin', null);
    const gone = await createUser('Gone Member');
    await db.query(`update public.profiles set deleted_at = now() where id = $1`, [gone]);
    expect((await as(admin).put(`/admin/people/${gone}/roles/moderator`)).statusCode).toBe(404);
  });
});

describe('care queue', () => {
  it('does not show a prayer partner requests from someone who blocked them', async () => {
    const member = await createUser('Care Blocker');
    const partner = await createUser('Care Partner Blocked');
    await grantRole(db, partner, 'prayer_partner', null);
    await db.query(`update public.care_settings set care_enabled = true`);
    const r = await as(member).post('/care-requests', { kind: 'pray_with_me', body: 'Please pray with me tonight.' });
    expect(r.statusCode).toBe(201);
    await as(member).put(`/people/${partner}/block`);
    const queue = (await as(partner).get('/care/queue')).json().requests;
    expect(queue.some((q: { id: string }) => q.id === r.json().id)).toBe(false);
  });
});
