import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import type { Queryable } from './db.js';

/** Verifies a bearer token and returns the Supabase Auth user id (`sub`). */
export type TokenVerifier = (token: string) => Promise<string>;

/**
 * Supabase Auth signs access tokens with asymmetric keys (ES256/RS256) and
 * publishes them at /auth/v1/.well-known/jwks.json. jose caches the key set
 * and refetches on an unknown `kid`.
 */
export function supabaseJwksVerifier(supabaseUrl: string): TokenVerifier {
  const base = supabaseUrl.replace(/\/$/, '');
  const jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`), {
    cacheMaxAge: 10 * 60 * 1000,
  });
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${base}/auth/v1`,
      audience: 'authenticated',
    });
    if (!payload.sub) throw new Error('token has no sub');
    return payload.sub;
  };
}

export interface AuthContext {
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function makeAuthHook(verify: TokenVerifier, db: Queryable) {
  return async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'unauthenticated', 'Missing bearer token');
    let userId: string;
    try {
      userId = await verify(header.slice(7));
    } catch {
      throw new AppError(401, 'unauthenticated', 'Invalid or expired token');
    }
    const { rows } = await db.query<{ suspended_until: Date | null }>(
      'select suspended_until from public.profiles where id = $1 and deleted_at is null',
      [userId],
    );
    const profile = rows[0];
    if (!profile) throw new AppError(401, 'unauthenticated', 'No profile for this user');
    const suspended = profile.suspended_until && profile.suspended_until > new Date();
    // Suspended members can still read, appeal, and protect themselves: block, report, leave a
    // conversation, mark it read, ask a pastor for help, and delete their account.
    if (suspended && req.method !== 'GET' && !allowedWhileSuspended(req.method, req.url.split('?')[0]!)) {
      const until = profile.suspended_until!.toDateString();
      throw new AppError(403, 'suspended', `Your account can't post until ${until}. You can appeal from your notifications.`);
    }
    req.auth = { userId };
  };
}

const SUSPENDED_ALLOWED: [string, RegExp][] = [
  ['POST', /^\/moderation\/items\/[^/]+\/appeal$/],
  ['DELETE', /^\/me$/],
  ['PUT', /^\/people\/[^/]+\/block$/],
  ['DELETE', /^\/people\/[^/]+\/block$/],
  ['POST', /^\/reports$/],
  ['POST', /^\/conversations\/[^/]+\/(decline|read)$/],
  ['POST', /^\/care-requests$/],
  ['POST', /^\/care-requests\/[^/]+\/close$/],
];

function allowedWhileSuspended(method: string, path: string) {
  return SUSPENDED_ALLOWED.some(([m, re]) => m === method && re.test(path));
}

export function requireUser(req: FastifyRequest): string {
  if (!req.auth) throw new AppError(401, 'unauthenticated', 'Sign in required');
  return req.auth.userId;
}
