// Offline replays: the app queues a post or a "Praying Now" when a request times out, but a slow
// request may still have reached us. The app sends the same Idempotency-Key header with the first
// try and every replay; a key already answered gets that first answer back, so nothing is done twice.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Queryable } from '../../db.js';
import { AppError, badRequest } from '../../errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set while this request is the first one with its Idempotency-Key. */
    idempotencyKey?: string;
  }
}

const KEY = /^[A-Za-z0-9_-]{8,100}$/;
/** Header on an answer replayed from the first request (the audit log skips it). */
export const REPLAY_HEADER = 'idempotent-replay';

export function idempotencyHooks(app: FastifyInstance, db: Queryable) {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const key = req.headers['idempotency-key'];
    if (req.method !== 'POST' || key === undefined || !req.auth) return;
    if (typeof key !== 'string' || !KEY.test(key)) throw badRequest('Idempotency-Key must be 8 to 100 letters, digits, - or _');
    const route = `${req.method} ${req.url.split('?')[0]}`;
    // A first try that never finished (the server restarted mid-request) frees its key after a minute.
    const { rowCount } = await db.query(
      `insert into public.request_keys (user_id, key, route) values ($1, $2, $3)
       on conflict (user_id, key) do update set route = excluded.route, created_at = now()
         where request_keys.status is null and request_keys.created_at < now() - interval '1 minute'`,
      [req.auth.userId, key, route],
    );
    if (rowCount) {
      req.idempotencyKey = key;
      return;
    }
    const { rows } = await db.query<{ route: string; status: number | null; body: string | null }>(
      'select route, status, body from public.request_keys where user_id = $1 and key = $2',
      [req.auth.userId, key],
    );
    const seen = rows[0];
    if (!seen || seen.status === null) throw new AppError(503, 'in_flight', 'This is still being sent. Try again in a moment.');
    if (seen.route !== route) throw badRequest('This Idempotency-Key was used for another request');
    return reply.code(seen.status).header(REPLAY_HEADER, 'true').type('application/json; charset=utf-8').send(seen.body ?? '{}');
  });

  // Keep a success for replays; a refusal or failure frees the key so a later try can run.
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const key = req.idempotencyKey;
    if (!key || !req.auth) return payload;
    req.idempotencyKey = undefined;
    try {
      if (reply.statusCode < 400 && (typeof payload === 'string' || payload === undefined || payload === null)) {
        await db.query('update public.request_keys set status = $3, body = $4 where user_id = $1 and key = $2', [
          req.auth.userId, key, reply.statusCode, payload ?? null,
        ]);
      } else {
        await db.query('delete from public.request_keys where user_id = $1 and key = $2', [req.auth.userId, key]);
      }
    } catch (err) {
      // The answer still goes out; a stuck key frees itself after a minute.
      req.log.error({ err }, 'idempotency key write failed');
    }
    return payload;
  });
}
