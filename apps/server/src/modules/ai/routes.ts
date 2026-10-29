import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as practice from '../practice-mode/index.js';
import * as autoPray from './auto-pray.js';
import * as ai from './index.js';
import type { Converse } from './provider.js';

// The "not God" conversation and the circle facilitator (docs/AI_COMPANIONS.md).
export function aiRoutes(app: FastifyInstance, db: Db, converse: Converse | null) {
  app.get('/ai-chat', async (req) => ai.chatInfo(db, requireUser(req)));
  app.post('/ai-chat', async (req) => ai.chat(db, await practice.converser(db, converse), requireUser(req), ai.ChatInput.parse(req.body)));

  app.get('/ai-facilitator', async (req) => ai.facilitatorInfo(db, requireUser(req)));
  app.post('/ai-facilitator', async (req) => ai.facilitate(db, await practice.converser(db, converse), requireUser(req), ai.FacilitateInput.parse(req.body)));
  app.post('/circle-requests', async (req, reply) => {
    const r = await ai.requestCircle(db, requireUser(req), ai.CircleRequest.parse(req.body));
    return reply.code(201).send(r);
  });

  // Auto-Pray: AI prayers under a request, kept apart from human prayers.
  app.get('/posts/:id/ai-prayers', async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return autoPray.info(db, requireUser(req), id);
  });
  app.put('/posts/:id/auto-pray', async (req) => {
    const userId = requireUser(req);
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    const { on } = z.object({ on: z.boolean() }).parse(req.body);
    return autoPray.setOptIn(db, userId, id, on);
  });

  app.get('/moderation/circle-requests', async (req) => {
    const { status } = z.object({ status: z.enum(['open', 'closed']).default('open') }).parse(req.query);
    return { requests: await ai.circleRequests(db, requireUser(req), status) };
  });
  app.post('/moderation/circle-requests/:id/close', async (req) => {
    const { id } = z.object({ id: z.uuid() }).parse(req.params);
    return ai.closeCircleRequest(db, requireUser(req), id);
  });

  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
  };
  app.get('/admin/ai-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await ai.settings(db), aiConnected: converse !== null };
  });
  app.patch('/admin/ai-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await ai.updateSettings(db, ai.SettingsPatch.parse(req.body)), aiConnected: converse !== null };
  });
}
