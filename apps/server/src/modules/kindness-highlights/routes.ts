import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as h from './index.js';

type Id = { Params: { id: string } };
const id = z.object({ id: z.uuid() });

export function kindnessHighlightRoutes(app: FastifyInstance, db: Db) {
  app.get('/kindness-highlights', async (req) => h.highlights(db, requireUser(req)));
  app.post<Id>('/comments/:id/lifted-me-up', async (req) => h.nominate(db, requireUser(req), id.parse(req.params).id));
  app.get('/me/highlight-asks', async (req) => h.mine(db, requireUser(req)));
  app.post<Id>('/me/highlight-asks/:id', async (req) => h.answer(db, requireUser(req), id.parse(req.params).id, z.object({ yes: z.boolean() }).parse(req.body).yes));
  app.post<Id>('/me/highlight-asks/:id/withdraw', async (req) => h.withdraw(db, requireUser(req), id.parse(req.params).id));
}
