import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as podcasts from './index.js';

/** The public RSS feed for podcast apps: no sign-in. 404 while switched off or unpublished. */
export function podcastPublicRoutes(app: FastifyInstance, db: Db) {
  app.get<{ Params: { slug: string } }>('/podcasts/:slug/feed.xml', async (req, reply) => {
    const slug = z.string().regex(/^[a-z0-9-]{3,40}$/).safeParse(req.params.slug);
    const body = slug.success ? await podcasts.feed(db, slug.data, `https://${req.hostname}/`) : null;
    if (!body) return reply.code(404).type('text/plain').send('Not found');
    return reply.type('application/rss+xml; charset=utf-8').header('cache-control', 'public, max-age=900').send(body);
  });
}

export function podcastRoutes(app: FastifyInstance, db: Db, fetcher: typeof fetch = fetch) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };
  const id = (req: FastifyRequest) => z.uuid().parse((req.params as { id: string }).id);

  app.get('/podcasts', async (req) => ({ shows: await podcasts.forMember(db, requireUser(req)) }));

  app.get('/admin/podcasts', async (req) => {
    await requireAdmin(req);
    return { enabled: await podcasts.enabled(db), shows: await podcasts.list(db) };
  });
  app.post('/admin/podcasts', async (req, reply) => {
    const adminId = await requireAdmin(req);
    const input = podcasts.NewShow.parse(req.body);
    reply.code(201);
    return { show: await withTx(db, (tx) => podcasts.createShow(tx, adminId, input)) };
  });
  app.patch<{ Params: { id: string } }>('/admin/podcasts/:id', async (req) => {
    await requireAdmin(req);
    return { show: await withTx(db, (tx) => podcasts.updateShow(tx, id(req), podcasts.ShowPatch.parse(req.body))) };
  });
  app.post<{ Params: { id: string } }>('/admin/podcasts/:id/episodes', async (req, reply) => {
    await requireAdmin(req);
    const input = podcasts.NewEpisode.parse(req.body);
    reply.code(201);
    return { show: await podcasts.addEpisode(db, id(req), input, fetcher) };
  });
  app.patch<{ Params: { id: string } }>('/admin/podcast-episodes/:id', async (req) => {
    await requireAdmin(req);
    return { show: await podcasts.updateEpisode(db, id(req), podcasts.EpisodePatch.parse(req.body)) };
  });
  app.delete<{ Params: { id: string } }>('/admin/podcast-episodes/:id', async (req) => {
    await requireAdmin(req);
    return { show: await podcasts.removeEpisode(db, id(req)) };
  });
}
