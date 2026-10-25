import { run } from 'graphile-worker';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { buildTaskList, crontab } from './tasks.js';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);

// Stateless: run as many worker processes as needed against the same database.
const runner = await run({
  pgPool: db,
  concurrency: config.WORKER_CONCURRENCY,
  taskList: buildTaskList(db, config),
  crontab,
});

await runner.promise;
await db.end();
