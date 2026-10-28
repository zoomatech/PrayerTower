// Law-enforcement cases and evidence holds, off by default. The switch is one shared
// row, so the "on" cases run in a transaction that is rolled back.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as legal from '../src/modules/legal/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

async function inTx(fn: (c: import('pg').PoolClient) => Promise<void>) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await legal.updateSettings(c, { enabled: true });
    await fn(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

describe('Legal requests', () => {
  it('is off by default and admin-only', async () => {
    const admin = await createUser('Legal Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Legal Member');
    expect((await as(admin).get('/admin/legal/settings')).json().settings).toEqual({ enabled: false, defaultHoldDays: 90 });
    expect((await as(member).get('/admin/legal/cases')).statusCode).toBe(403);
    expect((await as(admin).post('/admin/legal/cases', { kind: 'preservation', summary: 'Request' })).statusCode).toBe(403);
  });

  it('keeps a copy of what a member posted, even after they delete it, until the hold is released', async () => {
    const admin = await createUser('Hold Admin');
    await grantRole(db, admin, 'admin', null);
    const subject = await createUser('Held Hal');
    const post = await newRequest(subject, 'Please pray for my court date.');
    await inTx(async (c) => {
      const made = await legal.create(c, admin, { kind: 'preservation', agency: 'County Sheriff', reference: 'PR-2026-17', summary: 'Preservation request for one account', subject: subject });
      const caseId = (made.case as { id: string }).id;
      const held = await legal.placeHold(c, admin, caseId, {});
      const hold = held.holds[0] as { id: string; items: number; expiresAt: Date };
      expect(hold.items).toBeGreaterThanOrEqual(2);
      expect(hold.expiresAt.getTime() - Date.now()).toBeGreaterThan(89 * 86_400_000);

      await c.query('delete from public.posts where id = $1', [post.id]);
      const out = await legal.exportHold(c, hold.id);
      expect(out.hold).toMatchObject({ agency: 'County Sheriff', reference: 'PR-2026-17' });
      expect(out.items.find((i: { kind: string; sourceId: string }) => i.kind === 'post' && i.sourceId === post.id).data.body).toBe('Please pray for my court date.');
      expect(out.items.some((i: { kind: string }) => i.kind === 'profile')).toBe(true);

      // The case still names the member after their account is gone.
      await c.query('delete from public.profiles where id = $1', [subject]);
      expect((await legal.get(c, caseId)).case).toMatchObject({ subjectId: subject, subjectName: 'Deleted account' });
      expect((await legal.exportHold(c, hold.id)).items.some((i: { kind: string }) => i.kind === 'profile')).toBe(true);

      const closed = await legal.close(c, caseId);
      expect((closed.case as { status: string }).status).toBe('closed');
      expect((closed.holds[0] as { releasedAt: Date | null }).releasedAt).not.toBeNull();
      expect((await legal.exportHold(c, hold.id)).items).toEqual([]);
      await expect(legal.placeHold(c, admin, caseId, {})).rejects.toThrow(/closed/);
    });
  });

  it('lets a moderator escalate a report to the admins, once', async () => {
    const [admin, mod, poster, reporter] = [await createUser('Esc Admin'), await createUser('Esc Mod'), await createUser('Esc Poster'), await createUser('Esc Reporter')];
    await grantRole(db, admin, 'admin', null);
    await grantRole(db, mod, 'moderator', null);
    const post = await newRequest(poster, 'Threatening text for the test.');
    await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Threat' });
    const item = (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items[0].id as string;
    expect((await as(mod).post(`/moderation/items/${item}/escalate`, { note: 'Credible threat' })).statusCode).toBe(403);
    expect((await as(poster).post(`/moderation/items/${item}/escalate`, { note: 'x' })).statusCode).toBe(403);

    await inTx(async (c) => {
      const first = await legal.escalate(c, mod, item, 'Credible threat against a named person');
      expect(first.case).toMatchObject({ kind: 'referral', status: 'open', subjectId: poster, moderationItemId: item });
      const again = await legal.escalate(c, mod, item, 'Again');
      expect((again.case as { id: string }).id).toBe((first.case as { id: string }).id);
      const { rows } = await c.query(`select title from public.notifications where user_id = $1 and kind = 'legal_referral'`, [admin]);
      expect(rows).toHaveLength(1);
    });
  });

  it('releases holds past their end date', async () => {
    const admin = await createUser('Expiry Admin');
    await grantRole(db, admin, 'admin', null);
    const subject = await createUser('Expiry Subject');
    await inTx(async (c) => {
      const made = await legal.create(c, admin, { kind: 'emergency', summary: 'Emergency request', subject });
      const held = await legal.placeHold(c, admin, (made.case as { id: string }).id, { days: 1 });
      const holdId = (held.holds[0] as { id: string }).id;
      await c.query(`update public.evidence_holds set expires_at = now() - interval '1 minute' where id = $1`, [holdId]);
      expect(await legal.releaseExpired(c)).toBeGreaterThanOrEqual(1);
      expect((await legal.exportHold(c, holdId)).items).toEqual([]);
    });
  });
});
