import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as goals from './index.js';

// Circle goals on a request: "N people pray for this by <date>".
export function circleGoalRoutes(app: FastifyInstance, db: Db) {
  const Params = z.object({ id: z.uuid() });
  app.get('/posts/:id/circle-goal', async (req) => goals.get(db, requireUser(req), Params.parse(req.params).id));
  app.put('/posts/:id/circle-goal', async (req) => goals.set(db, requireUser(req), Params.parse(req.params).id, goals.NewGoal.parse(req.body)));
  app.delete('/posts/:id/circle-goal', async (req) => goals.remove(db, requireUser(req), Params.parse(req.params).id));
}
