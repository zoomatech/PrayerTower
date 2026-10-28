import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as events from './index.js';

type Id = { Params: { id: string } };

export function eventRoutes(app: FastifyInstance, db: Db) {
  app.get('/events', async (req) => {
    const { groupId } = z.object({ groupId: z.uuid().optional() }).parse(req.query);
    return { events: await events.upcoming(db, requireUser(req), { groupId }) };
  });

  app.get('/me/events', async (req) => ({ events: await events.upcoming(db, requireUser(req), { mine: true }) }));

  app.post('/events', async (req, reply) => {
    const input = events.NewEvent.parse(req.body);
    const event = await withTx(db, (tx) => events.create(tx, requireUser(req), input));
    reply.code(201);
    return { event };
  });

  app.get<Id>('/events/:id', async (req) => ({ event: await events.get(db, requireUser(req), req.params.id) }));

  app.put<Id>('/events/:id/rsvp', async (req) => {
    const { status } = z.object({ status: z.enum(['going', 'maybe']).default('going') }).parse(req.body ?? {});
    return { event: await events.rsvp(db, requireUser(req), req.params.id, status) };
  });

  app.delete<Id>('/events/:id/rsvp', async (req) => ({ event: await events.rsvp(db, requireUser(req), req.params.id, null) }));

  app.post<Id>('/events/:id/cancel', async (req) => {
    await withTx(db, (tx) => events.cancel(tx, requireUser(req), req.params.id));
    return { ok: true };
  });
}
