import { afterAll, describe, expect, it } from 'vitest';
import { buildApp, logSafeError } from '../src/app.js';
import { scrub } from '../src/instrument.js';
import { db } from './helpers.js';

afterAll(() => db.end());

describe('observability', () => {
  it('serves Prometheus metrics by route pattern, only with the metrics token', async () => {
    const token = 'metrics-token-for-tests-0123456789';
    const app = buildApp({ db, verifyToken: async (t) => t.slice(5), metricsToken: token });
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/posts/0190f5a0-0000-7000-8000-000000000000' });

    expect((await app.inject({ method: 'GET', url: '/metrics' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatch(/http_requests_total\{method="GET",route="\/health",status="200"\} 1/);
    expect(res.body).toContain('route="/posts/:id"');
    expect(res.body).not.toContain('0190f5a0');
    expect(res.body).toMatch(/job_queue_pending \d+/);
    expect(res.body).toContain('process_cpu_user_seconds_total');
    await app.close();
  });

  it('logs database errors without the row values in their detail', async () => {
    // One round trip, so the temporary table and the insert share a connection.
    const err = await db
      .query(`create temp table t_dup (email text primary key); insert into t_dup values ('ruth@example.org'), ('ruth@example.org')`)
      .catch((e: unknown) => e);
    expect((err as { detail?: string }).detail).toContain('ruth@example.org');
    const logged = logSafeError(err as Error);
    expect(logged).toMatchObject({ code: '23505', message: expect.stringContaining('duplicate key') });
    expect(JSON.stringify(logged)).not.toContain('ruth@example.org');
  });

  it('strips member content from error reports', () => {
    const event = scrub({
      type: undefined,
      request: { url: '/posts', method: 'POST', data: '{"body":"Pray for my cancer"}', headers: { authorization: 'Bearer x' }, cookies: { a: 'b' } },
      user: { id: 'u1', email: 'a@b.c' },
      extra: { body: 'Pray for my cancer' },
    });
    expect(JSON.stringify(event)).not.toMatch(/cancer|Bearer|a@b\.c/);
    expect(event.request).toEqual({ url: '/posts', method: 'POST' });
  });
});
