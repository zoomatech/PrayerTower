import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { auditedAction } from '../src/modules/audit/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('staff audit log', () => {
  it('records role changes and settings with who did it, and admins can read it', async () => {
    const admin = await createUser('Deborah');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Barak');

    expect((await as(admin).put(`/admin/people/${member}/roles/moderator`)).statusCode).toBe(200);
    expect((await as(admin).delete(`/admin/people/${member}/roles/moderator`)).statusCode).toBe(200);
    // Failed requests aren't changes.
    expect((await as(admin).put(`/admin/people/${member}/roles/king`)).statusCode).toBe(400);

    const log = (await as(admin).get(`/admin/audit-log?actorId=${admin}`)).json().entries;
    expect(log.map((e: { action: string }) => e.action)).toEqual([
      'DELETE /admin/people/:id/roles/:role',
      'PUT /admin/people/:id/roles/:role',
    ]);
    expect(log[1]).toMatchObject({ actor_id: admin, actor_name: 'Deborah', target_id: member, params: { id: member, role: 'moderator' }, status: 200 });

    // Filter by the member acted on; members can't read the log.
    expect((await as(admin).get(`/admin/audit-log?targetId=${member}`)).json().entries).toHaveLength(2);
    expect((await as(member).get('/admin/audit-log')).statusCode).toBe(403);
  });

  it('records moderator decisions but not ordinary members', async () => {
    const mod = await createUser('Huldah');
    await grantRole(db, mod, 'moderator', null);
    const poster = await createUser('Jael');
    const reporter = await createUser('Abigail');
    const post = await newRequest(poster, 'A request someone will report.');
    expect((await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'spam' })).statusCode).toBeLessThan(300);
    const { rows: [item] } = await db.query<{ id: string }>(`select id from public.moderation_items where target_id = $1`, [post.id]);
    expect((await as(mod).post(`/moderation/items/${item!.id}/decision`, { action: 'dismiss' })).statusCode).toBeLessThan(300);

    const { rows } = await db.query('select action, body from public.staff_audit_log where actor_id = any($1)', [[mod, reporter, poster]]);
    expect(rows).toEqual([{ action: 'POST /moderation/items/:id/decision', body: { action: 'dismiss' } }]);
  });

  it('covers every admin change and no reads', () => {
    expect(auditedAction('PATCH', '/admin/token-settings')).toBe('PATCH /admin/token-settings');
    expect(auditedAction('GET', '/admin/audit-log')).toBeNull();
    expect(auditedAction('POST', '/posts')).toBeNull();
    expect(auditedAction('POST', '/witness/cases/:id/notes')).toBe('POST /witness/cases/:id/notes');
  });

  it('keeps invitees out of the log: no CSV member list and no email addresses', async () => {
    const admin = await createUser('Phoebe');
    await grantRole(db, admin, 'admin', null);
    const csv = 'name,email\nRuth Moabite,ruth@example.org\nNaomi,naomi@example.org\n';
    expect((await as(admin).post('/admin/import', { kind: 'members', csv, dryRun: true })).statusCode).toBe(200);
    expect((await as(admin).post('/admin/invites', { note: 'For lydia@example.org', count: 1 })).statusCode).toBe(201);

    const { rows } = await db.query<{ action: string; body: Record<string, unknown> }>(
      `select action, body from public.staff_audit_log where actor_id = $1 order by created_at`,
      [admin],
    );
    expect(rows.map((r) => r.action)).toEqual(['POST /admin/import', 'POST /admin/invites']);
    expect(rows[0]!.body).toMatchObject({ kind: 'members', dryRun: true, csvLines: 3 });
    expect(rows[0]!.body.csv).toBeUndefined();
    expect(rows[1]!.body).toMatchObject({ note: 'For [email]', count: 1 });
    expect(JSON.stringify(rows)).not.toMatch(/example\.org|Ruth/);
  });
});

