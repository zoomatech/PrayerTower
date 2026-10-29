import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import * as site from '../site/index.js';
import * as sponsors from './index.js';

/** The public sponsor page: no sign-in. Not found while it is switched off. */
export function sponsorPublicRoutes(app: FastifyInstance, db: Db) {
  app.get('/sponsors/list', async (_req, reply) => {
    const r = await sponsors.publicList(db);
    if (!r.enabled) return reply.code(404).send({ error: 'not_found', message: 'The sponsor page is not published' });
    return r;
  });

  app.get('/sponsors', async (_req, reply) => {
    const r = await sponsors.publicList(db);
    const html = 'text/html; charset=utf-8';
    if (!r.enabled) return reply.code(404).type(html).send(site.layout('Not found', '<h1>This page is not published yet.</h1>', ''));
    return reply.type(html).header('cache-control', 'public, max-age=300').send(site.layout('Our sponsors', sponsors.pageHtml(r.sponsors, site.esc), ''));
  });
}
