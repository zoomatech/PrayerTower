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

  // Shared links: the apps open https://<host>/post/:id themselves once these files verify the domain.
  if (opts.appLinks?.appleAppIds.length) {
    const aasa = JSON.stringify(site.appleAppSiteAssociation(opts.appLinks));
    app.get('/.well-known/apple-app-site-association', async (_req, reply) => reply.type('application/json').send(aasa));
  }
  if (opts.appLinks?.androidFingerprints.length) {
    const links = JSON.stringify(site.assetLinks(opts.appLinks));
    app.get('/.well-known/assetlinks.json', async (_req, reply) => reply.type('application/json').send(links));
  }
  // Without the app (or before it is verified), the link lands here.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.get<{ Params: { id: string }; Querystring: { comment?: string } }>('/post/:id', async (req, reply) => {
    if (!uuid.test(req.params.id)) return reply.code(404).type(html).send(site.layout('Not found', '<h1>This link is not valid.</h1>', ''));
    const comment = req.query.comment && uuid.test(req.query.comment) ? req.query.comment : null;
    return reply.type(html).header('cache-control', 'no-store').send(site.sharedPost(opts, req.params.id, comment));
  });
}
