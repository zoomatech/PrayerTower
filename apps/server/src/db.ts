import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
/** Anything that can run a query: the pool or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString, max });
  // An idle client can drop (e.g. a database restart); log instead of crashing.
  pool.on('error', (err) => console.error('postgres pool error', err));
  return pool;
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
