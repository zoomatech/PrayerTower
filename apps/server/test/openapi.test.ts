import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { grantRole } from '../src/modules/accounts/index.js';
import { defaultLegalDir } from '../src/modules/site/index.js';
import { REQUEST_SCHEMAS } from '../src/openapi-schemas.js';
import { createUser, db } from './helpers.js';

afterAll(() => db.end());

const verifyToken = async (token: string) => {
  if (!token.startsWith('test:')) throw new Error('bad token');
  return token.slice(5);
};
const build = (apiDocs: { restricted: boolean; password: string | null }) =>
  buildApp({
    db,
    verifyToken,
    stationKey: 'k'.repeat(32),
    deletionPage: { supabaseUrl: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_test', supportEmail: null },
    site: { supportEmail: null, legalDir: defaultLegalDir(), appStoreUrl: null, playStoreUrl: null, crisisCountry: 'US' },
    apiDocs: { ...apiDocs, version: '9.9.9' },
  });

describe('OpenAPI spec and /api/docs', () => {
  it('describes every registered route, with auth and the zod request bodies', async () => {
    const app = build({ restricted: false, password: null });
    const res = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec).toMatchObject({ openapi: '3.1.0', info: { title: 'Prayer Tower API', version: '9.9.9' } });

    const ops = Object.entries(spec.paths as Record<string, Record<string, { security: unknown[]; requestBody?: { content: Record<string, { schema: { properties: Record<string, unknown> } }> }; parameters?: { name: string; in: string }[] }>>);
    const count = ops.reduce((n, [, m]) => n + Object.keys(m).length, 0);
    expect(count).toBeGreaterThan(150);

    const createPost = spec.paths['/posts'].post;
    expect(createPost.security).toEqual([{ member: [] }]);
    expect(Object.keys(createPost.requestBody.content['application/json'].schema.properties)).toEqual(expect.arrayContaining(['postType', 'body']));
    expect(spec.paths['/posts/{id}/comments'].post.parameters).toEqual([{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }]);
    expect(spec.paths['/admin/feedback'].get.parameters.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(['status', 'tag']));
    expect(spec.paths['/health'].get.security).toEqual([]);
    expect(spec.paths['/signup-config'].get.security).toEqual([]);
    const station = Object.entries(spec.paths).find(([p]) => p.startsWith('/station/'))!;
    expect(Object.values(station[1] as Record<string, { security: unknown }>)[0]!.security).toEqual([{ station: [] }]);
    // The docs endpoints don't describe themselves.
    expect(spec.paths['/api/docs']).toBeUndefined();

    // Every schema in the registry still matches a real route.
    const routes = new Set(ops.flatMap(([p, m]) => Object.keys(m).map((verb) => `${verb.toUpperCase()} ${p.replace(/\{(\w+)\}/g, ':$1')}`)));
    for (const key of Object.keys(REQUEST_SCHEMAS)) expect(routes, key).toContain(key);

    const page = await app.inject({ method: 'GET', url: '/api/docs' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body).toContain('swagger-ui-dist@5.33.1');
  });

  it('is staff-only in production', async () => {
    const staff = await createUser('Docs Admin');
    await grantRole(db, staff, 'admin', null);
    const member = await createUser('Docs Member');
    const app = build({ restricted: true, password: 'a-long-staff-docs-password' });
    const basic = (pw: string) => `Basic ${Buffer.from(`staff:${pw}`).toString('base64')}`;

    const none = await app.inject({ method: 'GET', url: '/api/docs' });
    expect(none.statusCode).toBe(401);
    expect(none.headers['www-authenticate']).toMatch(/^Basic/);
    expect((await app.inject({ method: 'GET', url: '/api/docs', headers: { authorization: basic('wrong-password-here') } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/docs', headers: { authorization: basic('a-long-staff-docs-password') } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/openapi.json', headers: { authorization: `Bearer test:${member}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/openapi.json', headers: { authorization: `Bearer test:${staff}` } })).statusCode).toBe(200);

    // No password: JSON for staff bearer tokens only, and no page.
    const bearerOnly = build({ restricted: true, password: null });
    expect((await bearerOnly.inject({ method: 'GET', url: '/api/docs' })).statusCode).toBe(404);
    expect((await bearerOnly.inject({ method: 'GET', url: '/api/openapi.json' })).statusCode).toBe(401);
    expect((await bearerOnly.inject({ method: 'GET', url: '/api/openapi.json', headers: { authorization: `Bearer test:${staff}` } })).statusCode).toBe(200);
  });
});
