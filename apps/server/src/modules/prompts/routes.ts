import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import * as prompts from './index.js';

export function promptRoutes(app: FastifyInstance, db: Db) {
  // The app asks on open or after idle time; the server applies the caps.
  app.get('/me/prompt', async (req) => ({ prompt: await withTx(db, (tx) => prompts.next(tx, requireUser(req))) }));

  app.post<{ Params: { id: string } }>('/me/prompts/:id/response', async (req) => {
    const userId = requireUser(req);
    const { response } = prompts.Response.parse(req.body);
    return withTx(db, (tx) => prompts.respond(tx, userId, req.params.id, response));
  });
}
