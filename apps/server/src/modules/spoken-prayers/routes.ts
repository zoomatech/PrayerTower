import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as spoken from './index.js';

type Id = { Params: { id: string } };

export function spokenPrayerRoutes(app: FastifyInstance, db: Db, storage: SupabaseClient | null) {
  app.get<Id>('/posts/:id/spoken-prayers', async (req) => spoken.forPost(db, storage, requireUser(req), req.params.id));

  app.put<Id>('/posts/:id/spoken-prayers/invite', async (req) => spoken.invite(db, requireUser(req), req.params.id, spoken.Invite.parse(req.body ?? {})));
  app.delete<Id>('/posts/:id/spoken-prayers/invite', async (req) => spoken.uninvite(db, requireUser(req), req.params.id));

  app.post<Id>('/posts/:id/spoken-prayers/upload-url', async (req) =>
    spoken.uploadUrl(db, storage, requireUser(req), req.params.id, spoken.UploadRequest.parse(req.body)),
  );
  app.post<Id>('/posts/:id/spoken-prayers', async (req, reply) => {
    const userId = requireUser(req);
    const input = spoken.NewSpoken.parse(req.body);
    const made = await withTx(db, (tx) => spoken.create(tx, userId, req.params.id, input));
    reply.code(201);
    return made;
  });

  app.post<Id>('/spoken-prayers/:id/listened', async (req) => {
    const userId = requireUser(req);
    return withTx(db, (tx) => spoken.listened(tx, userId, req.params.id));
  });
  app.delete<Id>('/spoken-prayers/:id', async (req) => spoken.remove(db, storage, requireUser(req), req.params.id));

  const staff = async (userId: string, ...roles: Parameters<typeof hasRole>[2][]) => {
    if (!(await hasRole(db, userId, ...roles))) throw forbidden('Staff only');
  };
  app.get<Id>('/moderation/spoken-prayers/:id/audio', async (req) => {
    await staff(requireUser(req), 'moderator', 'admin');
    return spoken.audioForStaff(db, storage, req.params.id);
  });
  app.get('/admin/spoken-prayers', async (req) => {
    await staff(requireUser(req), 'admin');
    return { settings: await spoken.settings(db) };
  });
  app.patch('/admin/spoken-prayers', async (req) => {
    await staff(requireUser(req), 'admin');
    return { settings: await spoken.updateSettings(db, spoken.SettingsPatch.parse(req.body)) };
  });
}
