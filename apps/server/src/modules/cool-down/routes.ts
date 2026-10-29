import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as coolDown from './index.js';

export function coolDownRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/cool-down', async (req) => ({ coolDown: await coolDown.mine(db, requireUser(req)) }));
  app.post<{ Params: { id: string } }>('/me/cool-down/:id', async (req) => {
    await coolDown.done(db, requireUser(req), z.uuid().parse(req.params.id), coolDown.Done.parse(req.body).choice);
    return { ok: true };
  });
}
