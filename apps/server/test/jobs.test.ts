// Background job reliability: tries per task, the failed-jobs list, retry and
// discard, and the admin alert.
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_MAX_ATTEMPTS, enqueue, MAX_ATTEMPTS } from '../src/jobs.js';
import { grantRole } from '../src/modules/accounts/index.js';
import { checkFailures } from '../src/modules/jobs/index.js';
import { crontab } from '../src/tasks.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

// A job that has used every try, as Graphile Worker leaves it.
async function deadJob(task: string, error: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id::text from graphile_worker.add_job($1, $2::json, run_at := now() + interval '1 day', max_attempts := 2)`,
    [task, JSON.stringify({ notificationId: '00000000-0000-0000-0000-000000000000' })],
  );
  const id = rows[0]!.id;
  await db.query(`select graphile_worker.permanently_fail_jobs(array[$1::bigint], $2)`, [id, error]);
  return id;
}
const job = async (id: string) => (await db.query(`select attempts, max_attempts from graphile_worker.jobs where id = $1::bigint`, [id])).rows[0];

describe('background jobs', () => {
  it('gives each task a limited number of tries, and every cron job a limit too', async () => {
    const key = `test-tries-${Date.now()}`;
    await enqueue(db, 'notifications_send_push', { notificationId: '00000000-0000-0000-0000-000000000000' }, { jobKey: key, runAt: new Date(Date.now() + 86_400_000) });
    await enqueue(db, 'some_other_task', {}, { jobKey: `${key}-b`, runAt: new Date(Date.now() + 86_400_000) });
    const { rows } = await db.query<{ key: string; max_attempts: number }>(`select key, max_attempts from graphile_worker.jobs where key like $1 order by key`, [`${key}%`]);
    expect(rows).toEqual([
      { key, max_attempts: MAX_ATTEMPTS.notifications_send_push },
      { key: `${key}-b`, max_attempts: DEFAULT_MAX_ATTEMPTS },
    ]);
    await db.query(`select graphile_worker.remove_job(k) from unnest($1::text[]) k`, [[key, `${key}-b`]]);
    for (const line of crontab.split('\n').filter((l) => /^\S+ \S+ \S+ \S+ \S+ /.test(l))) expect(line).toMatch(/\?max=\d+/);
  });

  it('lists failed jobs for admins, who can retry or discard them', async () => {
    const admin = await createUser('Jobs Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Jobs Member');
    const a = await deadJob('notifications_send_push', 'Expo push failed: 503 Service Unavailable\n    at stack');
    const b = await deadJob('notifications_send_push', 'boom');

    expect((await as(member).get('/admin/jobs')).statusCode).toBe(403);
    const list = (await as(admin).get('/admin/jobs')).json();
    expect(list.failed.find((j: { id: string }) => j.id === a)).toMatchObject({ task: 'notifications_send_push', attempts: 2, maxAttempts: 2, lastError: 'Expo push failed: 503 Service Unavailable' });

    expect((await as(admin).post(`/admin/jobs/${a}/retry`)).json()).toEqual({ retried: true });
    expect(await job(a)).toEqual({ attempts: 0, max_attempts: 2 });
    // A job that isn't failed can't be retried or discarded.
    expect((await as(admin).post(`/admin/jobs/${a}/retry`)).statusCode).toBe(404);
    expect((await as(admin).post(`/admin/jobs/${a}/discard`)).statusCode).toBe(404);
    expect((await as(admin).post(`/admin/jobs/abc/discard`)).statusCode).toBe(400);

    expect((await as(admin).post(`/admin/jobs/${b}/discard`)).json()).toEqual({ discarded: true });
    expect(await job(b)).toBeUndefined();
    await db.query(`select graphile_worker.complete_jobs(array[$1::bigint])`, [a]);
  });

  it('alerts every admin once about jobs that ran out of tries', async () => {
    const admin = await createUser('Alert Admin');
    await grantRole(db, admin, 'admin', null);
    const id = await deadJob('radio_transmit', 'radio offline');
    const first = await checkFailures(db);
    expect(first.newlyFailed).toBeGreaterThanOrEqual(1);
    const alerts = async () =>
      (await db.query<{ title: string; body: string }>(`select title, body from public.notifications where user_id = $1 and kind = 'job_alert'`, [admin])).rows;
    expect((await alerts()).length).toBeGreaterThanOrEqual(1);
    expect((await alerts()).some((n) => n.body.includes('radio_transmit'))).toBe(true);
    const count = (await alerts()).length;
    // The same failed job doesn't alert again.
    await checkFailures(db);
    expect((await db.query(`select 1 from public.job_alerts where job_id = $1::bigint`, [id])).rows).toHaveLength(1);
    expect((await alerts()).length).toBeLessThanOrEqual(count + 0);
    await db.query(`select graphile_worker.complete_jobs(array[$1::bigint])`, [id]);
  });
});
