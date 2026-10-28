import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { makeAuthHook, type TokenVerifier } from './auth.js';
import type { Db } from './db.js';
import { AppError } from './errors.js';
import { adminRoutes } from './modules/admin/routes.js';
import { accountRoutes } from './modules/accounts/routes.js';
import { commitmentRoutes } from './modules/commitments/routes.js';
import { feedRoutes } from './modules/feed/routes.js';
import { moderationRoutes } from './modules/moderation/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { postRoutes } from './modules/posts/routes.js';
import { promptRoutes } from './modules/prompts/routes.js';
import { tierRoutes } from './modules/tiers/routes.js';
import { prayerActionRoutes } from './modules/prayer-actions/routes.js';
import { radioRoutes } from './modules/radio/routes.js';
import { tokenRoutes } from './modules/tokens/routes.js';

export interface AppDeps {
  db: Db;
  verifyToken: TokenVerifier;
  storage?: SupabaseClient | null;
  logger?: boolean;
  /** Allowed browser origins for the web app; empty = any (development). */
  corsOrigins?: string[];
}

export function buildApp({ db, verifyToken, storage = null, logger = false, corsOrigins = [] }: AppDeps) {
  const app = Fastify({ logger });
  app.register(cors, {
    origin: corsOrigins.length ? corsOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid_request', issues: err.issues });
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '22P02') return reply.code(400).send({ error: 'invalid_request', message: 'Malformed id or value' });
    if (pgCode === '23514' || pgCode === '23503') return reply.code(400).send({ error: 'invalid_request', message: 'Request breaks a data rule' });
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode && statusCode < 500) return reply.code(statusCode).send({ error: 'invalid_request', message: (err as Error).message });
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.decorateRequest('auth', null);
  app.get('/health', async () => {
    await db.query('select 1');
    return { ok: true };
  });

  // Everything else requires a signed-in member.
  app.register(async (authed) => {
    authed.addHook('preHandler', makeAuthHook(verifyToken, db));
    accountRoutes(authed, db);
    postRoutes(authed, db, storage);
    feedRoutes(authed, db);
    prayerActionRoutes(authed, db);
    commitmentRoutes(authed, db);
    tokenRoutes(authed, db);
    radioRoutes(authed, db);
    notificationRoutes(authed, db);
    moderationRoutes(authed, db);
    promptRoutes(authed, db);
    tierRoutes(authed, db);
    adminRoutes(authed, db);
  });

  return app;
}
