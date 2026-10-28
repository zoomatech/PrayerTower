import type { FastifyInstance } from 'fastify';
import * as site from './index.js';

/** Public pages: no sign-in. Built once at start-up; restart to pick up a new policy file. */
export function siteRoutes(app: FastifyInstance, opts: site.SiteOptions) {
  const html = 'text/html; charset=utf-8';
  // English at /, Spanish at /es (see site.pathFor).
  for (const lang of ['en', 'es'] as const) {
    const landing = site.landing(opts, lang);
    const support = site.support(opts, lang);
    const privacy = site.legalPage(opts, 'privacy', lang);
    const terms = site.legalPage(opts, 'terms', lang);
    app.get(site.pathFor(lang, '/'), async (_req, reply) => reply.type(html).send(landing));
    app.get(site.pathFor(lang, '/support'), async (_req, reply) => reply.type(html).send(support));
    app.get(site.pathFor(lang, '/privacy'), async (_req, reply) => reply.code(privacy.status).type(html).send(privacy.html));
    app.get(site.pathFor(lang, '/terms'), async (_req, reply) => reply.code(terms.status).type(html).send(terms.html));
  }
  app.get('/es/', async (_req, reply) => reply.redirect('/es', 301));

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
