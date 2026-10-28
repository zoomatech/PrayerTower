import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { notFound } from '../../errors.js';
import * as accounts from './index.js';

export function accountRoutes(app: FastifyInstance, db: Db) {
  app.get('/me', async (req) => {
    const userId = requireUser(req);
    const profile = await accounts.getProfile(db, userId);
    if (!profile) throw notFound('Profile');
    return { profile, roles: await accounts.roles(db, userId) };
  });

  app.patch('/me', async (req) => {
    const input = accounts.ProfileUpdate.parse(req.body);
    return { profile: await accounts.updateProfile(db, requireUser(req), input) };
  });

  app.get<{ Params: { id: string } }>('/people/:id', async (req) => {
    const p = await accounts.getProfile(db, req.params.id);
    if (!p) throw notFound('Person');
    return { person: { id: p.id, displayName: p.display_name, handle: p.handle, bio: p.bio, whyHere: p.why_here } };
  });

  app.put<{ Params: { id: string } }>('/people/:id/follow', async (req) => {
    await accounts.follow(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/people/:id/follow', async (req) => {
    await accounts.unfollow(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.get('/me/followers', async (req) => ({ people: await accounts.followers(db, requireUser(req)) }));
  app.get('/me/following', async (req) => ({ people: await accounts.following(db, requireUser(req)) }));
}
