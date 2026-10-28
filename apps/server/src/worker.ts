import * as Sentry from '@sentry/node';
import { run } from 'graphile-worker';
import { loadConfig, loadDotEnv } from './config.js';
import { createPool } from './db.js';
import { buildTaskList, crontab } from './tasks.js';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_POOL_MAX);

// Stateless: run as many worker processes as needed against the same database.
const runner = await run({
  pgPool: db,
  concurrency: config.WORKER_CONCURRENCY,
  taskList: buildTaskList(db, config),
  crontab,
});

// A job that has used up its retries is reported (task name only, never its payload).
runner.events.on('job:failed', ({ job, error }) => {
  Sentry.captureException(error, { tags: { task: job.task_identifier }, extra: { attempts: job.attempts } });
});

await runner.promise;
await db.end();
