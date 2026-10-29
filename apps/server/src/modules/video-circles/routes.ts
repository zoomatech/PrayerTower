import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import type { JaasKeys } from '../live/jaas.js';
import * as circles from './index.js';

type Id = { Params: { id: string } };

// Video circles (docs/VIDEO_CIRCLES.md).
export function videoCircleRoutes(app: FastifyInstance, db: Db, jaas: JaasKeys | null = null) {
  const id = (req: FastifyRequest) => z.object({ id: z.uuid() }).parse(req.params).id;
  // As in live/routes.ts: practice rooms are served from this host.
  const opts = (req: FastifyRequest) => ({
    jaas,
    base: `${String(req.headers['x-forwarded-proto'] ?? req.protocol).split(',')[0]}://${req.host}`,
  });

  app.get<Id>('/mends/:id/video-circle', async (req) => {
    const userId = requireUser(req);
    return {
      circle: await circles.forMend(db, userId, id(req), await hasRole(db, userId, 'moderator', 'admin'), opts(req)),
    };
  });
  app.post<Id>('/moderation/mends/:id/video-circle', async (req) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'moderator', 'admin'))) throw forbidden('Moderators only');
    return withTx(db, (tx) => circles.offer(tx, userId, id(req), circles.Offer.parse(req.body ?? {}), opts(req)));
  });
  app.post<Id>('/video-circles/:id/answer', async (req) => withTx(db, (tx) => circles.answer(tx, requireUser(req), id(req), circles.Answer.parse(req.body), opts(req))));
  app.post<Id>('/video-circles/:id/end', async (req) => circles.end(db, requireUser(req), id(req), opts(req)));
}
