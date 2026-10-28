import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import * as site from '../site/index.js';
import * as fund from './index.js';

/** The public report: no sign-in. Not found while the page is switched off. */
export function commonFundPublicRoutes(app: FastifyInstance, db: Db) {
  app.get('/common-prayer-fund/report', async (_req, reply) => {
    const r = await fund.report(db);
    if (!r.enabled) return reply.code(404).send({ error: 'not_found', message: 'The Common Prayer Fund report is not published' });
    return r;
  });

  app.get('/fund', async (_req, reply) => {
    const r = await fund.report(db);
    const html = 'text/html; charset=utf-8';
    if (!r.enabled) return reply.code(404).type(html).send(site.layout('Not found', '<h1>This page is not published yet.</h1>', ''));
    return reply.type(html).header('cache-control', 'public, max-age=300').send(site.layout('Common Prayer Fund', fund.reportHtml(r, site.esc), ''));
  });
}
