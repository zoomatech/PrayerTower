import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import * as notifications from './index.js';

export function notificationRoutes(app: FastifyInstance, db: Db) {
  app.get('/me/notifications', async (req) => ({ notifications: await notifications.list(db, requireUser(req)) }));

  app.post('/me/notifications/read', async (req) => {
    const { ids } = z.object({ ids: z.array(z.uuid()).max(200) }).parse(req.body);
    await notifications.markRead(db, requireUser(req), ids);
    return { ok: true };
  });

  app.post('/me/push-tokens', async (req) => {
    const body = z
      .object({ token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/), platform: z.enum(['ios', 'android', 'web']).optional() })
      .parse(req.body);
    await notifications.registerPushToken(db, requireUser(req), body.token, body.platform);
    return { ok: true };
  });
}
