// Admin routes: roles, tier settings, token settings, and pilot metrics. Admin-only; each
// area's data comes from that module's public functions.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import * as commitments from '../commitments/index.js';
import * as moderation from '../moderation/index.js';
import * as posts from '../posts/index.js';
import * as prayerActions from '../prayer-actions/index.js';
import * as radio from '../radio/index.js';
import * as tiers from '../tiers/index.js';
import * as tokens from '../tokens/index.js';

const ROLES = ['admin', 'moderator', 'pastor_counselor', 'prayer_partner'] as const;

export function adminRoutes(app: FastifyInstance, db: Db) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  app.get<{ Params: { id: string } }>('/admin/people/:id/roles', async (req) => {
    await requireAdmin(req);
    return { roles: await accounts.roles(db, req.params.id) };
  });

  app.put<{ Params: { id: string; role: string } }>('/admin/people/:id/roles/:role', async (req) => {
    const adminId = await requireAdmin(req);
    const role = z.enum(ROLES).parse(req.params.role);
    if (!(await accounts.getProfile(db, req.params.id))) throw notFound('Person');
    await accounts.grantRole(db, req.params.id, role, adminId);
    return { roles: await accounts.roles(db, req.params.id) };
  });

  app.delete<{ Params: { id: string; role: string } }>('/admin/people/:id/roles/:role', async (req) => {
    await requireAdmin(req);
    await accounts.revokeRole(db, req.params.id, z.enum(ROLES).parse(req.params.role));
    return { roles: await accounts.roles(db, req.params.id) };
  });

  app.get('/admin/tiers', async (req) => {
    await requireAdmin(req);
    return { tiers: await tiers.settings(db) };
  });

  app.patch<{ Params: { tier: string } }>('/admin/tiers/:tier', async (req) => {
    await requireAdmin(req);
    const input = tiers.SettingUpdate.parse(req.body);
    return { tier: await withTx(db, (tx) => tiers.updateSetting(tx, req.params.tier, input)) };
  });

  // Priestly token rate and the minimum gap that makes a prayer count as verified.
  app.get('/admin/token-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await tokens.settings(db) };
  });

  app.patch('/admin/token-settings', async (req) => {
    await requireAdmin(req);
    const input = z
      .object({
        priestlyPrayersPerToken: z.number().int().min(1).max(10_000).optional(),
        verifiedPrayerMinGapSeconds: z.number().int().min(0).max(86_400).optional(),
        radioPrayerCost: z.number().int().min(1).max(10_000).optional(),
      })
      .parse(req.body);
    return {
      settings: await tokens.updateSettings(db, {
        priestly_prayers_per_token: input.priestlyPrayersPerToken,
        verified_prayer_min_gap_seconds: input.verifiedPrayerMinGapSeconds,
        radio_prayer_cost: input.radioPrayerCost,
      }),
    };
  });

  // Pilot metrics: requests posted, Praying Now taps, commitments made vs kept,
  // moderation volume, tokens earned and spent.
  app.get('/admin/metrics', async (req) => {
    await requireAdmin(req);
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(3650).default(7) }).parse(req.query);
    const since = new Date(Date.now() - days * 86_400_000);
    const [members, content, prayer, promises, ledger, mod, radioPrayers] = await Promise.all([
      accounts.metrics(db, since),
      posts.metrics(db, since),
      prayerActions.metrics(db, since),
      commitments.metrics(db, since),
      tokens.metrics(db, since),
      moderation.metrics(db, since),
      radio.metrics(db, since),
    ]);
    return { since, members, posts: content, prayer, commitments: promises, tokens: ledger, moderation: mod, radio: radioPrayers };
  });
}
