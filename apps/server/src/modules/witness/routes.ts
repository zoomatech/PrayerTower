import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as witness from './index.js';

type Id = { Params: { id: string } };

export function witnessRoutes(app: FastifyInstance, db: Db) {
  app.post<Id>('/posts/:id/witness', async (req, reply) => {
    const userId = requireUser(req);
    await witness.requireWitness(db, userId);
    const r = await witness.flag(db, userId, req.params.id, witness.NewCase.parse(req.body));
    reply.code(201);
    return r;
  });

  app.get('/witness/cases', async (req) => {
    const { status } = z.object({ status: z.enum(witness.STATUSES).optional() }).parse(req.query);
    return { cases: await witness.list(db, requireUser(req), status) };
  });

  app.get<Id>('/witness/cases/:id/notes', async (req) => ({ notes: await witness.notes(db, requireUser(req), req.params.id) }));

  app.post<Id>('/witness/cases/:id/notes', async (req, reply) => {
    const userId = requireUser(req);
    await witness.requireWitness(db, userId); // before reading the body, so non-staff always get 403
    await witness.addNote(db, userId, req.params.id, witness.NewNote.parse(req.body));
    reply.code(201);
    return { ok: true };
  });

  app.patch<Id>('/witness/cases/:id', async (req) => {
    await witness.update(db, requireUser(req), req.params.id, witness.CaseUpdate.parse(req.body));
    return { ok: true };
  });

  app.post<Id>('/witness/cases/:id/story', async (req, reply) => {
    const userId = requireUser(req);
    await witness.requireWitness(db, userId);
    const r = await witness.draftStory(db, userId, req.params.id, witness.NewStory.parse(req.body));
    reply.code(201);
    return r;
  });

  app.delete<Id>('/witness/stories/:id', async (req) => {
    await witness.withdrawStory(db, requireUser(req), req.params.id);
    return { ok: true };
  });

  app.get('/me/witness-stories', async (req) => ({ stories: await witness.myStories(db, requireUser(req)) }));

  app.post<Id>('/me/witness-stories/:id/decision', async (req) => {
    const { approve } = z.object({ approve: z.boolean() }).parse(req.body);
    await witness.decideStory(db, requireUser(req), req.params.id, approve);
    return { ok: true };
  });

  app.get('/help-stories', async (req) => witness.shownStories(db, requireUser(req)));
}
