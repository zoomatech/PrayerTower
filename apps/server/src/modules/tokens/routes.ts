import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import * as moderation from '../moderation/index.js';
import * as posts from '../posts/index.js';
import * as tokens from './index.js';

const Amount = z.object({
  amount: z.number().int().positive().max(1_000_000),
  idempotencyKey: z.string().min(1).max(100),
});

export function tokenRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/tokens', async (req) => {
    const userId = requireUser(req);
    const [balance, priestly, history] = await Promise.all([
      tokens.balanceOf(db, userId),
      tokens.priestlyStatus(db, userId),
      tokens.history(db, userId),
    ]);
    return { balance, priestly, history };
  });

  app.post('/tokens/gift', async (req) => {
    const userId = requireUser(req);
    const body = Amount.extend({ toUserId: z.uuid(), currency: z.enum(['regular', 'priestly']).default('regular') }).parse(req.body);
    const t = await withTx(db, (tx) => tokens.gift(tx, userId, body.toUserId, body.amount, body.idempotencyKey, body.currency));
    return { transferId: t.id, balance: await tokens.balanceOf(db, userId, body.currency) };
  });

  // Give Priestly tokens to the fund that runs the intercessory infrastructure.
  app.post('/tokens/priestly/donate', async (req) => {
    const userId = requireUser(req);
    const body = Amount.parse(req.body);
    const t = await withTx(db, (tx) => tokens.donatePriestly(tx, userId, body.amount, body.idempotencyKey));
    return { transferId: t.id, priestly: await tokens.priestlyStatus(db, userId) };
  });

  // Spend tokens to extend a request's reach. Never required for baseline visibility.
  app.post<{ Params: { id: string } }>('/posts/:id/boost', async (req) => {
    const userId = requireUser(req);
    const body = Amount.parse(req.body);
    const post = await posts.getVisible(db, req.params.id);
    if (!post) throw notFound('Post');
    if (await moderation.awaitingCrisisReview(db, post.id)) throw conflict('This request is waiting for a moderator to check in with the person who posted it. It can be amplified after that.');
    const t = await withTx(db, (tx) => tokens.spendOnReach(tx, userId, post.id, body.amount, body.idempotencyKey));
    return { transferId: t.id, reach: await tokens.reachOf(db, post.id), balance: await tokens.balanceOf(db, userId) };
  });
}
