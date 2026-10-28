import * as Sentry from '@sentry/node';
import { createClient } from '@supabase/supabase-js';
import { run } from 'graphile-worker';
import { loadConfig, loadDotEnv } from './config.js';
import { createPool } from './db.js';
import { MEDIA_BUCKET } from './modules/posts/media.js';
import { buildTaskList, crontab } from './tasks.js';
import { storageImageStore } from './modules/crosspost/index.js';

loadDotEnv();
const config = loadConfig();
const db = createPool(config.DATABASE_URL, config.DATABASE_POOL_MAX);
// Photos of removed requests are deleted from Storage by the retention job.
const storage = config.SUPABASE_SECRET_KEY
  ? createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
  : null;
const removeMedia = storage
  ? async (paths: string[]) => {
      const { error } = await storage.storage.from(MEDIA_BUCKET).remove(paths);
      if (error) throw error;
    }
  : null;

// Photos copied from connected Facebook and Threads accounts.
const storeImage = storage
  ? storageImageStore(async (path, bytes, contentType) => {
      const { error } = await storage.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType });
      if (error) throw error;
    })
  : null;

// Stateless: run as many worker processes as needed against the same database.
const runner = await run({
  pgPool: db,
  concurrency: config.WORKER_CONCURRENCY,
  taskList: buildTaskList(db, config, { removeMedia, storeImage }),
  crontab,
});

// A job that has used up its retries is reported (task name only, never its payload).
runner.events.on('job:failed', ({ job, error }) => {
  Sentry.captureException(error, { tags: { task: job.task_identifier }, extra: { attempts: job.attempts } });
});

await runner.promise;
await db.end();
