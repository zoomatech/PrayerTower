import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as library from './index.js';
import * as parallels from './parallels.js';
import * as plans from './plans.js';

// Scripture and ancient writings search (off by default).
export function libraryRoutes(app: FastifyInstance, db: Db) {
  app.get('/library', async (req) => library.overview(db, requireUser(req)));
  app.get('/library/daily', async (req) => library.daily(db, requireUser(req)));
  app.get('/library/search', async (req) => library.search(db, requireUser(req), library.Search.parse(req.query)));
  // Parallels: related passages side by side across texts.
  const Theme = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) });
  app.get('/library/parallels', async (req) => parallels.list(db, requireUser(req)));
  app.get('/library/parallels/:id', async (req) => parallels.theme(db, requireUser(req), Theme.parse(req.params).id));
  // Reading plans from the library's texts.
  const Plan = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) });
  const PlanDay = Plan.extend({ day: z.coerce.number().int().min(1).max(400) });
  app.get('/library/plans', async (req) => plans.list(db, requireUser(req)));
  app.put('/library/plans/:id/follow', async (req) => plans.follow(db, requireUser(req), Plan.parse(req.params).id, plans.FollowInput.parse(req.body ?? {})));
  app.delete('/library/plans/:id/follow', async (req) => plans.unfollow(db, requireUser(req), Plan.parse(req.params).id));
  app.get('/library/plans/:id/days/:day', async (req) => {
    const p = PlanDay.parse(req.params);
    return plans.day(db, requireUser(req), p.id, p.day);
  });
  app.post('/library/plans/:id/days/:day/read', async (req) => {
    const p = PlanDay.parse(req.params);
    return plans.markRead(db, requireUser(req), p.id, p.day);
  });
}
