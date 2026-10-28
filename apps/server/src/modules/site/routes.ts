import type { FastifyInstance } from 'fastify';
import * as site from './index.js';

/** Public pages: no sign-in. Built once at start-up; restart to pick up a new policy file. */
export function siteRoutes(app: FastifyInstance, opts: site.SiteOptions) {
  const html = 'text/html; charset=utf-8';
  const landing = site.landing(opts);
  const support = site.support(opts);
  const privacy = site.legalPage(opts, 'privacy');
  const terms = site.legalPage(opts, 'terms');
  app.get('/', async (_req, reply) => reply.type(html).send(landing));
  app.get('/support', async (_req, reply) => reply.type(html).send(support));
  app.get('/privacy', async (_req, reply) => reply.code(privacy.status).type(html).send(privacy.html));
  app.get('/terms', async (_req, reply) => reply.code(terms.status).type(html).send(terms.html));
}
