import type { FastifyInstance } from 'fastify';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as notebook from './index.js';

type Id = { Params: { id: string } };

export function notebookRoutes(app: FastifyInstance, db: Db) {
  app.get('/features', async () => ({ features: await notebook.features(db) }));

  app.get('/stats/worldwide', async (req) => ({ stats: await notebook.worldwide(db, requireUser(req)) }));

  app.get('/me/thanks-card', async (req) => ({ card: await notebook.thanksCard(db, requireUser(req)) }));
  app.post('/me/thanks-card/dismiss', async (req) => {
    await notebook.dismissThanksCard(db, requireUser(req));
    return { dismissed: true };
  });

  app.get<Id>('/events/:id/inputs', async (req) => notebook.listInputs(db, requireUser(req), req.params.id));
  app.post<Id>('/events/:id/inputs', async (req, reply) => {
    const input = notebook.NewInput.parse(req.body);
    reply.code(201);
    return { input: await notebook.addInput(db, requireUser(req), req.params.id, input) };
  });
  app.delete<{ Params: { id: string; inputId: string } }>('/events/:id/inputs/:inputId', async (req) => {
    await notebook.removeInput(db, requireUser(req), req.params.id, req.params.inputId);
    return { removed: true };
  });
}
