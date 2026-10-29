import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
/** Anything that can run a query: the pool or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString, max });
  // An idle client can drop (e.g. a database restart); log instead of crashing.
  pool.on('error', (err) => console.error('postgres pool error', err));
  // A checked-out client can drop too; without a listener Node exits the process
  // (https://worker.graphile.org/errors/peh).
  pool.on('connect', (client) => {
    client.on('error', (err) => console.error('postgres client error', err));
    serializeQueries(client);
  });
  return pool;
}

/**
 * Code that runs several queries with Promise.all on one transaction's client relies on
 * pg queueing them, which pg 8 deprecates and pg 9 removes. Chain them instead, in the
 * order they were sent (the same order pg's queue used). Callback and cursor queries
 * (the pool's own) pass straight through.
 */
function serializeQueries(client: pg.PoolClient) {
  const query = client.query.bind(client) as (...args: unknown[]) => unknown;
  let last: Promise<unknown> = Promise.resolve();
  (client as unknown as { query: (...args: unknown[]) => unknown }).query = (...args: unknown[]) => {
    const first = args[0] as { submit?: unknown } | undefined;
    if (typeof args[args.length - 1] === 'function' || typeof first?.submit === 'function') return query(...args);
    const run = last.then(() => query(...args));
    last = run.catch(() => undefined);
    return run;
  };
}

export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
