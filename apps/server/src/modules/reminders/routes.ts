import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as reminders from './index.js';

export function reminderRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/daily-reminder', async (req) => reminders.mine(db, requireUser(req)));
  // Body: { hour, minute, days, timeZone } to set, or { off: true } to turn it off.
  app.put('/me/daily-reminder', async (req) => {
    const body = req.body as { off?: boolean } | null;
    return reminders.setMine(db, requireUser(req), body?.off ? null : reminders.Choice.parse(req.body));
  });
}
