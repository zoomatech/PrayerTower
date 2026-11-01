import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as library from './index.js';
import * as listen from './listen.js';
import * as notes from './notes.js';
import * as offline from './offline.js';
import * as parallels from './parallels.js';
import * as plans from './plans.js';
import * as studies from './studies.js';
import * as words from './words.js';

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
  // Word study on the King James Bible (Strong's numbers).
  app.get('/library/words', async (req) => words.verse(db, requireUser(req), words.VerseQuery.parse(req.query).ref));
  app.get('/library/words/:id', async (req) => words.entry(db, requireUser(req), words.EntryParams.parse(req.params).id, words.EntryQuery.parse(req.query)));
  // Highlights and notes.
  app.get('/library/notes', async (req) => notes.list(db, requireUser(req), notes.ListQuery.parse(req.query)));
  app.put('/library/notes', async (req) => notes.save(db, requireUser(req), notes.SaveInput.parse(req.body)));
  app.delete('/library/notes/:id', async (req) => notes.remove(db, requireUser(req), z.object({ id: z.uuid() }).parse(req.params).id));
  app.get('/library/notes/circle/:id', async (req) => notes.circle(db, requireUser(req), z.object({ id: z.uuid() }).parse(req.params).id));
  // Listening: a public-domain recording of where a passage is, if there is one.
  app.get('/library/listen', async (req) => listen.recording(db, requireUser(req), listen.ListenQuery.parse(req.query)));
  app.get('/library/listening', async (req) => listen.history(db, requireUser(req)));
  app.put('/library/listening', async (req) => listen.saveProgress(db, requireUser(req), listen.ProgressInput.parse(req.body)));
  // Circle study rooms.
  app.get('/library/studies', async (req) => studies.list(db, requireUser(req), z.object({ circle: z.uuid() }).parse(req.query).circle));
  app.post('/library/studies', async (req, reply) => {
    const userId = requireUser(req);
    const input = studies.StartInput.parse(req.body);
    const r = await withTx(db, (tx) => studies.start(tx, userId, input));
    reply.code(201);
    return r;
  });
  app.get('/library/studies/:id', async (req) => studies.get(db, requireUser(req), z.object({ id: z.uuid() }).parse(req.params).id));
  app.delete('/library/studies/:id', async (req) => studies.remove(db, requireUser(req), z.object({ id: z.uuid() }).parse(req.params).id));
  app.post('/library/studies/:id/replies', async (req, reply) => {
    const userId = requireUser(req);
    const studyId = z.object({ id: z.uuid() }).parse(req.params).id;
    const input = studies.ReplyInput.parse(req.body);
    const r = await withTx(db, (tx) => studies.reply(tx, userId, studyId, input));
    reply.code(201);
    return r;
  });
  app.delete('/library/study-replies/:id', async (req) => studies.removeReply(db, requireUser(req), z.object({ id: z.uuid() }).parse(req.params).id));
  // Offline texts for the native app.
  app.get('/library/offline', async (req) => offline.list(db, requireUser(req)));
  app.get('/library/offline/:id', async (req, reply) => {
    const id = z.object({ id: z.enum(library.COLLECTIONS) }).parse(req.params).id;
    const f = await offline.download(db, requireUser(req), id);
    // The file is already gzipped JSON: sent as is, and the client unzips it.
    return reply.header('content-type', 'application/json').header('content-encoding', 'gzip').header('etag', `"${f.version}"`).send(f.bytes);
  });
}
