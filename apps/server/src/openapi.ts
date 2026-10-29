// OpenAPI 3.1 description of this API, built from the routes Fastify actually
// registered (method, path, path parameters and who may call it) plus the zod
// schemas the handlers parse (openapi-schemas.ts). Served as JSON at
// /api/openapi.json and as a Swagger UI page at /api/docs.
//
// In production the docs are staff-only: send API_DOCS_PASSWORD with HTTP Basic
// auth (any user name), or an admin's or moderator's bearer token. Without a
// password, production serves only the JSON, to staff bearer tokens (a browser
// can't send one, so there is no page). Elsewhere both are open.
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TokenVerifier } from './auth.js';
import type { Db } from './db.js';
import { hasRole } from './modules/accounts/index.js';
import { REQUEST_SCHEMAS } from './openapi-schemas.js';

export type Auth = 'public' | 'member' | 'station';

export interface RouteInfo {
  method: string;
  url: string;
  auth: Auth;
}

/** Collects every route as it is added. The signed-in and station scopes mark their own. */
export class RouteCatalog {
  private routes = new Map<string, RouteInfo>();
  private auth = new Map<string, Auth>();

  add(method: string, url: string) {
    const key = `${method} ${url}`;
    if (!this.routes.has(key)) this.routes.set(key, { method, url, auth: 'public' });
  }

  mark(method: string, url: string, auth: Auth) {
    this.auth.set(`${method} ${url}`, auth);
  }

  list(): RouteInfo[] {
    return [...this.routes.entries()].map(([key, r]) => ({ ...r, auth: this.auth.get(key) ?? 'public' }));
  }
}

/** Hook for a scope: every route it registers gets `auth`. */
export function markScope(scope: FastifyInstance, catalog: RouteCatalog, auth: Auth) {
  scope.addHook('onRoute', (r) => {
    for (const method of [r.method].flat()) if (method !== 'HEAD') catalog.mark(method, r.url, auth);
  });
}

const DOCS_PATHS = new Set(['/api/docs', '/api/openapi.json']);
const toOpenApiPath = (url: string) => url.replace(/:([A-Za-z_]\w*)/g, '{$1}');
const jsonSchema = (s: z.ZodType) => {
  const { $schema: _drop, ...rest } = z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  return rest;
};

// Tag by the first path segment, with staff areas grouped.
function tagOf(url: string): string {
  const [first = 'root', second] = url.split('/').filter(Boolean);
  if (first === 'admin') return 'admin';
  if (first === 'me') return second === 'tokens' ? 'tokens' : 'me';
  return first.replace(/-/g, ' ');
}

export function buildSpec(routes: RouteInfo[], version: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method))) {
    if (DOCS_PATHS.has(r.url) || r.method === 'OPTIONS' || r.url === '*') continue;
    const params = [...r.url.matchAll(/:([A-Za-z_]\w*)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    const schemas = REQUEST_SCHEMAS[`${r.method} ${r.url}`] ?? {};
    const query: unknown[] = [];
    if (schemas.query) {
      const qs = jsonSchema(schemas.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(qs.properties ?? {})) query.push({ name, in: 'query', required: qs.required?.includes(name) ?? false, schema });
    }
    const op: Record<string, unknown> = {
      tags: [tagOf(r.url)],
      operationId: `${r.method.toLowerCase()}${toOpenApiPath(r.url).replace(/[{}]/g, '').replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''))}`,
      ...(params.length || query.length ? { parameters: [...params, ...query] } : {}),
      ...(schemas.body ? { requestBody: { required: true, content: { 'application/json': { schema: jsonSchema(schemas.body) } } } } : {}),
      security: r.auth === 'member' ? [{ member: [] }] : r.auth === 'station' ? [{ station: [] }] : [],
      responses: {
        '200': { description: 'OK' },
        ...(schemas.body || schemas.query || params.length ? { '400': { description: 'Invalid request ({ error, issues } from zod)' } } : {}),
        ...(r.auth !== 'public' ? { '401': { description: 'Not signed in' } } : {}),
        ...(r.url.startsWith('/admin/') ? { '403': { description: 'Admins only' } } : {}),
      },
    };
    (paths[toOpenApiPath(r.url)] ??= {})[r.method.toLowerCase()] = op;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Prayer Tower API',
      version,
      description:
        'Generated from the registered routes. Request bodies come from the zod schemas each handler parses; routes without one take no body or a small one described in the code. Errors are { error, message } (or { error, issues } for invalid input).',
    },
    components: {
      securitySchemes: {
        member: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'A Supabase Auth access token.' },
        station: { type: 'apiKey', in: 'header', name: 'x-station-key', description: 'The radio station key (STATION_API_KEY).' },
      },
    },
    paths,
  };
}

const SWAGGER_UI = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.1';
const docsPage = () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prayer Tower API</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css"></head>
<body><div id="api"></div>
<script src="${SWAGGER_UI}/swagger-ui-bundle.js" crossorigin></script>
<script>SwaggerUIBundle({ url: './openapi.json', dom_id: '#api', deepLinking: true });</script>
</body></html>`;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface DocsOptions {
  catalog: RouteCatalog;
  version: string;
  /** Production: staff-only. */
  restricted: boolean;
  /** HTTP Basic password for staff in production; null = only staff bearer tokens. */
  password: string | null;
  verifyToken: TokenVerifier;
  db: Db;
}

export function docsRoutes(app: FastifyInstance, o: DocsOptions) {
  const allowed = async (req: FastifyRequest): Promise<boolean> => {
    if (!o.restricted) return true;
    const header = req.headers.authorization ?? '';
    if (o.password && header.startsWith('Basic ')) {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      return same(decoded.slice(decoded.indexOf(':') + 1), o.password);
    }
    if (header.startsWith('Bearer ')) {
      const v = await o.verifyToken(header.slice(7)).catch(() => null);
      const userId = typeof v === 'string' ? v : (v?.sub ?? null);
      return !!userId && (await hasRole(o.db, userId, 'admin', 'moderator'));
    }
    return false;
  };
  const gate = async (req: FastifyRequest, reply: FastifyReply) => {
    if (await allowed(req)) return true;
    if (o.password) reply.header('www-authenticate', 'Basic realm="Prayer Tower API docs", charset="UTF-8"');
    reply.code(401).send({ error: 'unauthorized', message: 'Staff only' });
    return false;
  };

  app.get('/api/openapi.json', async (req, reply) => ((await gate(req, reply)) ? buildSpec(o.catalog.list(), o.version) : reply));
  if (o.restricted && !o.password) return;
  app.get('/api/docs', async (req, reply) => {
    if (!(await gate(req, reply))) return reply;
    return reply.type('text/html; charset=utf-8').header('cache-control', 'no-store').send(docsPage());
  });
}
