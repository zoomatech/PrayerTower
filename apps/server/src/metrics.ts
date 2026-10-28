// Prometheus metrics at GET /metrics (scrape with METRICS_TOKEN as a bearer
// token): request counts and latency by route, plus Node process stats. Route
// patterns (/posts/:id), never real ids or content, label the series.
import type { FastifyInstance } from 'fastify';
import client from 'prom-client';
import type { Db } from './db.js';

export function registerMetrics(app: FastifyInstance, db: Db, token: string) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });
  const requests = new client.Counter({
    name: 'http_requests_total',
    help: 'HTTP requests by method, route pattern and status code',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [registry],
  });
  const duration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration by method and route pattern',
    labelNames: ['method', 'route'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  new client.Gauge({
    name: 'job_queue_pending',
    help: 'Background jobs waiting to run (reminders, pushes, moderation scans)',
    registers: [registry],
    async collect() {
      const { rows } = await db
        .query<{ n: number }>(`select count(*)::int as n from graphile_worker.jobs where locked_at is null and attempts < max_attempts`)
        .catch(() => ({ rows: [{ n: -1 }] }));
      this.set(rows[0]!.n);
    },
  });
  new client.Gauge({
    name: 'db_pool_waiting',
    help: 'Queries waiting for a database connection',
    registers: [registry],
    collect() {
      this.set(db.waitingCount);
    },
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? 'unmatched';
    if (route === '/metrics') return;
    requests.inc({ method: req.method, route, status: String(reply.statusCode) });
    duration.observe({ method: req.method, route }, reply.elapsedTime / 1000);
  });

  app.get('/metrics', async (req, reply) => {
    if (req.headers.authorization !== `Bearer ${token}`) return reply.code(401).send({ error: 'unauthenticated', message: 'Metrics token required' });
    reply.type(registry.contentType);
    return registry.metrics();
  });
}
