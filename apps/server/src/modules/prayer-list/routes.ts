import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as list from './index.js';

// My prayer list: private names and topics with optional reminders.
export function prayerListRoutes(app: FastifyInstance, db: Db) {
  const Params = z.object({ id: z.uuid() });
  app.get('/me/prayer-list', async (req) => list.list(db, requireUser(req)));
  app.post('/me/prayer-list', async (req) => list.add(db, requireUser(req), list.NewItem.parse(req.body)));
  app.patch('/me/prayer-list/:id', async (req) => list.edit(db, requireUser(req), Params.parse(req.params).id, list.EditItem.parse(req.body)));
  app.delete('/me/prayer-list/:id', async (req) => list.remove(db, requireUser(req), Params.parse(req.params).id));
  app.post('/me/prayer-list/:id/prayed', async (req) => list.prayed(db, requireUser(req), Params.parse(req.params).id));
}
