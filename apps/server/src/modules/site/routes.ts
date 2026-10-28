import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../../db.js';
import { languages } from '../../language.js';
import * as site from './index.js';
import * as openCircle from './open-circle.js';
import { promisePage } from './promise.js';

/** Public pages: no sign-in. Built once at start-up; restart to pick up a new policy file. */
export function siteRoutes(app: FastifyInstance, opts: site.SiteOptions, db?: Db) {
  const html = 'text/html; charset=utf-8';
  const notFound = () => site.layout('Not found', '<h1>This page is not available.</h1>', '');
  // Open Circle's own pages: at the root on its own domains, and always under /open-circle.
  const oc = opts.openCircle ?? null;
  const ocRoot = oc ? openCircle.pages(opts, oc, '') : null;
  const ocHere = (req: FastifyRequest) => (ocRoot && openCircle.isOpenCircleHost(oc, req.hostname) ? ocRoot : null);
  if (oc) {
    const prefixed = openCircle.pages(opts, oc, openCircle.PREFIX);
    app.get(openCircle.PREFIX, async (_req, reply) => reply.type(html).send(prefixed.landing));
    app.get(`${openCircle.PREFIX}/`, async (_req, reply) => reply.redirect(openCircle.PREFIX, 301));
    app.get(`${openCircle.PREFIX}/support`, async (_req, reply) => reply.type(html).send(prefixed.support));
    app.get(`${openCircle.PREFIX}/privacy`, async (_req, reply) => reply.code(prefixed.privacy.status).type(html).send(prefixed.privacy.html));
    app.get(`${openCircle.PREFIX}/terms`, async (_req, reply) => reply.code(prefixed.terms.status).type(html).send(prefixed.terms.html));
  }

  // English at /, Spanish at /es (see site.pathFor). While Spanish is off, /es pages send people to the English page.
  for (const lang of languages.spanish ? (['en', 'es'] as const) : (['en'] as const)) {
    const landing = site.landing(opts, lang);
    const support = site.support(opts, lang);
    const privacy = site.legalPage(opts, 'privacy', lang);
    const terms = site.legalPage(opts, 'terms', lang);
    // Open Circle is English only: on its domain the /es pages send people to its English page.
    app.get(site.pathFor(lang, '/'), async (req, reply) => {
      const o = ocHere(req);
      return o ? (lang === 'es' ? reply.redirect('/', 302) : reply.type(html).send(o.landing)) : reply.type(html).send(landing);
    });
    app.get(site.pathFor(lang, '/support'), async (req, reply) => {
      const o = ocHere(req);
      return o ? (lang === 'es' ? reply.redirect('/support', 302) : reply.type(html).send(o.support)) : reply.type(html).send(support);
    });
    app.get(site.pathFor(lang, '/privacy'), async (req, reply) => {
      const o = ocHere(req);
      if (o) return lang === 'es' ? reply.redirect('/privacy', 302) : reply.code(o.privacy.status).type(html).send(o.privacy.html);
      return reply.code(privacy.status).type(html).send(privacy.html);
    });
    app.get(site.pathFor(lang, '/terms'), async (req, reply) => {
      const o = ocHere(req);
      if (o) return lang === 'es' ? reply.redirect('/terms', 302) : reply.code(o.terms.status).type(html).send(o.terms.html);
      return reply.code(terms.status).type(html).send(terms.html);
    });
  }
  if (languages.spanish) app.get('/es/', async (_req, reply) => reply.redirect('/es', 301));
  else {
    for (const page of ['/', '/support', '/privacy', '/terms']) app.get(site.pathFor('es', page), async (_req, reply) => reply.redirect(page, 302));
    app.get('/es/', async (_req, reply) => reply.redirect('/', 302));
  }

  // The ad-free promise, only while Admin → Notebook ideas has it on.
  const promiseOn = async () => (db ? (await db.query<{ on: boolean }>('select promise_page_enabled as on from public.notebook_settings')).rows[0]?.on === true : false);
  const prayerPromise = promisePage('Prayer Tower');
  const ocPromise = oc ? promisePage(oc.name, openCircle.brand(oc, '')) : null;
  app.get('/promise', async (req, reply) => {
    if (!(await promiseOn())) return reply.code(404).type(html).send(notFound());
    return reply.type(html).send(ocHere(req) ? ocPromise : prayerPromise);
  });
  if (oc) {
    const prefixed = promisePage(oc.name, openCircle.brand(oc, openCircle.PREFIX));
    app.get(`${openCircle.PREFIX}/promise`, async (_req, reply) =>
      (await promiseOn()) ? reply.type(html).send(prefixed) : reply.code(404).type(html).send(notFound()),
    );
  }

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
    const o = ocHere(req);
    return reply.type(html).header('cache-control', 'no-store').send(o ? o.shared(req.params.id, comment) : site.sharedPost(opts, req.params.id, comment));
  });
}
