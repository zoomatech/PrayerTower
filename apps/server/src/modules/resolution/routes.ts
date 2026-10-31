import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import { markAnsweredAndTell } from '../posts/routes.js';
import * as posts from '../posts/index.js';
import * as resolution from './index.js';

type Id = { Params: { id: string } };

export function resolutionRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  app.get<Id>('/posts/:id/resolution', async (req) => resolution.status(db, requireUser(req), id.parse(req.params).id));

  app.post<Id>('/posts/:id/resolution', async (req) => {
    const userId = requireUser(req);
    const { id: postId } = id.parse(req.params);
    const input = resolution.Answer.parse(req.body);
    return withTx(db, (tx) => resolution.answer(tx, userId, postId, input, () => markAnsweredAndTell(tx, userId, postId)));
  });

  app.post<Id>('/posts/:id/resolution/repost', async (req, reply) => {
    const userId = requireUser(req);
    const { id: postId } = id.parse(req.params);
    const input = resolution.Repost.parse(req.body ?? {});
    const made = await withTx(db, (tx) => resolution.repost(tx, userId, postId, input));
    reply.code(201);
    return { post: (await posts.cards(db, [made.id], userId))[0], harm: made.harm };
  });

  app.post<Id>('/posts/:id/resolution/token', async (req) => {
    const userId = requireUser(req);
    const { id: postId } = id.parse(req.params);
    return withTx(db, (tx) => resolution.claimToken(tx, userId, postId));
  });

  app.get('/admin/resolution-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await resolution.settings(db) };
  });
  app.patch('/admin/resolution-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await resolution.updateSettings(db, resolution.SettingsPatch.parse(req.body)) };
  });
  app.get('/admin/resolution', async (req) => {
    await requireAdmin(req);
    return resolution.report(db);
  });
}
