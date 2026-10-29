import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as repair from './index.js';

type Id = { Params: { id: string } };

export function repairRoutes(app: FastifyInstance, db: Db) {
  const id = (req: FastifyRequest) => z.object({ id: z.uuid() }).parse(req.params).id;
  const requireModerator = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
    return userId;
  };

  app.get('/me/welcome-card', async (req) => repair.welcomeCard(db, requireUser(req)));
  app.post('/me/welcome-card/dismiss', async (req) => repair.dismissWelcome(db, requireUser(req)));

  app.post<Id>('/comments/:id/ask-kindly', async (req) => withTx(db, (tx) => repair.askKindly(tx, requireUser(req), id(req), repair.KindAsk.parse(req.body))));

  app.post<Id>('/comments/:id/mend', async (req) => ({ mend: await withTx(db, (tx) => repair.invite(tx, requireUser(req), id(req))) }));
  app.get<Id>('/mends/:id', async (req) => ({ mend: await repair.mend(db, requireUser(req), id(req)) }));
  app.put<Id>('/mends/:id/sorry', async (req) => ({ mend: await repair.writeSorry(db, requireUser(req), id(req), repair.Sorry.parse(req.body)) }));
  app.post<Id>('/mends/:id/accept', async (req) => ({ mend: await withTx(db, (tx) => repair.accept(tx, requireUser(req), id(req))) }));
  app.post<Id>('/mends/:id/close', async (req) => ({ mend: await withTx(db, (tx) => repair.close(tx, requireUser(req), id(req))) }));

  app.get('/moderation/mends', async (req) => {
    await requireModerator(req);
    return { mends: await repair.reviewQueue(db) };
  });
  app.post<Id>('/moderation/mends/:id', async (req) => {
    const moderatorId = await requireModerator(req);
    return withTx(db, (tx) => repair.review(tx, moderatorId, id(req), repair.Review.parse(req.body)));
  });
}
