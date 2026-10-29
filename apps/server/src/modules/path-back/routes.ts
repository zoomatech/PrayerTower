import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as pathBack from './index.js';

export function pathBackRoutes(app: FastifyInstance, db: Db) {
  const id = z.object({ id: z.uuid() });
  app.get<{ Params: { id: string } }>('/me/removed/:id', async (req) => pathBack.words(db, requireUser(req), id.parse(req.params).id));
}
