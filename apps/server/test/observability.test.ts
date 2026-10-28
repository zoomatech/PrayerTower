import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
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
