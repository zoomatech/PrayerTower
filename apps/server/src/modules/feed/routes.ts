import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { chooseTheme, getFeed, themeChoices } from './index.js';

export function feedRoutes(app: FastifyInstance, db: Db) {
  app.get('/feed', async (req) => {
    const { page, pageSize } = z
      .object({ page: z.coerce.number().int().min(0).default(0), pageSize: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(req.query);
    return getFeed(db, requireUser(req), page, pageSize);
  });

  app.get('/me/feed-themes', async (req) => themeChoices(db, requireUser(req)));

  app.put('/me/feed-theme', async (req) => {
    const { slug } = z.object({ slug: z.string().min(1).max(40).nullable() }).parse(req.body);
    return chooseTheme(db, requireUser(req), slug);
  });
}
