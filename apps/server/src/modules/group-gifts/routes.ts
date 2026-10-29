import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import * as gifts from './index.js';

// Gifts to a prayer group or a meet-up, split among the people there.
export function groupGiftRoutes(app: FastifyInstance, db: Db) {
  const Params = z.object({ id: z.uuid() });
  for (const target of ['group', 'event'] as const) {
    const path = target === 'group' ? '/groups/:id/gift' : '/events/:id/gift';
    app.get(path, async (req) => gifts.preview(db, requireUser(req), target, Params.parse(req.params).id));
    app.post(path, async (req) => {
      const userId = requireUser(req);
      const id = Params.parse(req.params).id;
      const body = gifts.Gift.parse(req.body);
      return withTx(db, (tx) => gifts.give(tx, userId, target, id, body));
    });
  }
}
