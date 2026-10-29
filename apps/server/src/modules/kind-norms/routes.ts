import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import { getViewable } from '../posts/index.js';
import * as kind from './index.js';

type Id = { Params: { id: string } };

export function kindNormsRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/me/kindness-promise', async (req) => kind.promise(db, requireUser(req)));
  app.post('/me/kindness-promise', async (req) => {
    await kind.agree(db, requireUser(req));
    return { agreed: true };
  });

  // What the reply box shows: the rules reminder, and whether the thread is resting.
  app.get<Id>('/posts/:id/reply-box', async (req) => {
    const userId = requireUser(req);
    const { id: postId } = id.parse(req.params);
    if (!(await getViewable(db, userId, postId))) throw notFound('Post');
    return kind.replyBox(db, userId, postId);
  });

  app.put<Id>('/comments/:id/helped', async (req) => {
    const { id: commentId } = id.parse(req.params);
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    return kind.appreciate(db, requireUser(req), commentId, on);
  });

  // Offer a sorry for one's own comment, to whoever sent a gentle note about it.
  app.get<Id>('/comments/:id/sorry-offer', async (req) => {
    const { id: commentId } = id.parse(req.params);
    return kind.sorryOffer(db, requireUser(req), commentId);
  });
  app.post<Id>('/comments/:id/sorry-offer', async (req) => {
    const { id: commentId } = id.parse(req.params);
    return kind.offerSorry(db, requireUser(req), commentId);
  });

  app.get('/admin/kind-norms', async (req) => {
    await requireAdmin(req);
    return { settings: await kind.settings(db) };
  });
  app.patch('/admin/kind-norms', async (req) => {
    await requireAdmin(req);
    return { settings: await kind.updateSettings(db, kind.SettingsPatch.parse(req.body)) };
  });
}
