// Closing the loop for members, the spoken readout and name privacy (followup.ts, privacy.ts).
// Admins switch them in Admin → Radio; members choose their own notice and name privacy.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { badRequest, forbidden } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as followup from './followup.js';

const LoopPatch = z.object({ followup: z.boolean().optional(), readAloud: z.boolean().optional(), namePrivacy: z.boolean().optional() });
const PrefsPatch = z.object({ followup: z.boolean().optional(), namesPrivate: z.boolean().optional() });

export function radioLoopRoutes(app: FastifyInstance, db: Db) {
  const admin = async (userId: string) => {
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };

  app.get('/admin/radio-loop', async (req) => {
    await admin(requireUser(req));
    return followup.loopSettings(db);
  });
  app.patch('/admin/radio-loop', async (req) => {
    await admin(requireUser(req));
    return followup.updateLoopSettings(db, LoopPatch.parse(req.body));
  });

  // "Sent by radio at 9:30 PM, heard by 4 listeners", for the sender and the asker: 404 while off.
  app.get<{ Params: { id: string } }>('/posts/:id/radio-summary', async (req) => followup.forPost(db, requireUser(req), req.params.id));

  // The member's own choices; null for one whose switch is off.
  app.get('/me/radio-prefs', async (req) => followup.prefs(db, requireUser(req)));
  app.patch('/me/radio-prefs', async (req) => {
    const userId = requireUser(req);
    const p = PrefsPatch.parse(req.body);
    const now = await followup.prefs(db, userId);
    if ((p.followup !== undefined && now.followup === null) || (p.namesPrivate !== undefined && now.namesPrivate === null)) throw badRequest('That choice is off');
    return followup.setPrefs(db, userId, p);
  });
}
