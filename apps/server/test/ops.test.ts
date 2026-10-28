// Monitoring: worker and station heartbeats, server errors, /health/ready, the
// Admin → Operations status and the ops alert.
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { grantRole } from '../src/modules/accounts/index.js';
import { beat, check, LIMITS, status } from '../src/modules/ops/index.js';
import { buildTaskList, crontab } from '../src/tasks.js';
import { app, as, config, createUser, db, STATION_KEY } from './helpers.js';

afterAll(() => db.end());

const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

describe('operations status', () => {
  it('runs the heartbeat every minute and the check every 5 minutes', () => {
    expect(crontab).toContain('* * * * * ops_heartbeat');
    expect(crontab).toContain('*/5 * * * * ops_check');
    expect(Object.keys(buildTaskList(db, config))).toEqual(expect.arrayContaining(['ops_heartbeat', 'ops_check']));
  });

  it('reports the worker down once its heartbeat is stale, and /health/ready follows', async () => {
    await beat(db, 'worker');
    expect((await status(db)).worker.ok).toBe(true);
    expect((await app.inject({ method: 'GET', url: '/health/ready' })).json()).toMatchObject({ ok: expect.any(Boolean) });

    const stale = await status(db, later(LIMITS.workerStaleSeconds + 5));
    expect(stale.worker.ok).toBe(false);
    expect(stale.problems).toContain('worker_down');

    await db.query(`update public.ops_heartbeats set seen_at = now() - interval '1 hour' where name = 'worker'`);
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().problems).toContain('worker_down');
    await beat(db, 'worker');
  });

  it('records server errors by route pattern only, and counts them', async () => {
    await db.query(`delete from public.server_errors where route = '/broken/:id'`);
    const broken = buildApp({ db, verifyToken: async (t) => t, logger: false });
    broken.get('/broken/:id', async () => {
      throw new Error('boom');
    });
    expect((await broken.inject({ method: 'GET', url: '/broken/123' })).statusCode).toBe(500);
    // onResponse runs after the reply is sent.
    await expect.poll(async () => (await db.query(`select 1 from public.server_errors where route = '/broken/:id'`)).rowCount).toBe(1);
    await broken.close();
    const before = (await status(db)).errors.lastHour;
    await db.query(`insert into public.server_errors (method, route, status) select 'GET', '/posts/:id', 500 from generate_series(1, $1)`, [LIMITS.errorsPerHour]);
    const s = await status(db);
    expect(s.errors.lastHour).toBeGreaterThanOrEqual(before + LIMITS.errorsPerHour);
    expect(s.errors.recent[0]).toMatchObject({ method: 'GET', route: '/posts/:id', status: 500 });
    expect(s.problems).toContain('server_errors');
  });

  it('notes when the station was last heard from, and flags it only in station mode with prayers waiting', async () => {
    await app.inject({ method: 'POST', url: '/station/claim', headers: { 'x-station-key': STATION_KEY } });
    const s = await status(db);
    expect(s.radio.station.lastSeen).not.toBeNull();
    expect(s.radio).toMatchObject({ mode: 'log', station: { ok: null } });
    expect(s.problems).not.toContain('station_silent');
  });

  it('shows admins the status and alerts them once an hour per problem', async () => {
    const admin = await createUser('Ops Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Ops Member');
    expect((await as(member).get('/admin/ops')).statusCode).toBe(403);
    const res = (await as(admin).get('/admin/ops')).json();
    expect(res.status).toMatchObject({ database: { ms: expect.any(Number) }, queue: { waiting: expect.any(Number) }, radio: { mode: 'log' } });

    const when = later(LIMITS.workerStaleSeconds + 5);
    expect((await check(db, when)).alerted).toContain('worker_down');
    await check(db, when);
    const alerts = (await as(admin).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind === 'ops_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain('Admin → Operations');
  });

  it('drops error rows older than 30 days', async () => {
    await db.query(`insert into public.server_errors (at, method, route, status) values (now() - interval '40 days', 'GET', '/old', 500)`);
    await check(db);
    expect((await db.query(`select 1 from public.server_errors where route = '/old'`)).rowCount).toBe(0);
  });
});
