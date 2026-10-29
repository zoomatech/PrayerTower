import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { AppError, forbidden } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as donations from './index.js';

/** No sign-in: whether giving is on, the public summary, and Stripe's webhook. */
export function donationPublicRoutes(app: FastifyInstance, db: Db, stripe: donations.StripeKeys | null) {
  app.get('/donations/info', async () => donations.info(db, stripe));
  app.get('/donations/summary', async () => donations.summary(db));

  // Stripe signs the raw body, so this route reads it as text (https://docs.stripe.com/webhooks).
  app.register(async (hook) => {
    hook.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 512 * 1024 }, (_req, body, done) => done(null, body));
    hook.post('/donations/stripe-webhook', async (req, reply) => {
      if (!stripe?.webhookSecret) throw new AppError(503, 'not_configured', 'Stripe webhooks are not set up (STRIPE_WEBHOOK_SECRET)');
      const raw = String(req.body ?? '');
      if (!donations.verifyStripeSignature(raw, req.headers['stripe-signature'] as string | undefined, stripe.webhookSecret)) {
        return reply.code(400).send({ error: 'bad_signature', message: 'Bad Stripe signature' });
      }
      await withTx(db, (tx) => donations.stripeEvent(tx, JSON.parse(raw)));
      return { received: true };
    });
  });
}

export function donationRoutes(app: FastifyInstance, db: Db, stripe: donations.StripeKeys | null, webAppUrl: string | null) {
  const requireAdmin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };

  app.post('/donations/checkout', async (req, reply) => {
    const userId = requireUser(req);
    const input = donations.Checkout.parse(req.body);
    const base = (webAppUrl ?? 'https://prayertower.app').replace(/\/+$/, '');
    const out = await withTx(db, (tx) => donations.checkout(tx, stripe, userId, input, { success: `${base}/give?thanks=1`, cancel: `${base}/give` }));
    return reply.code(201).send(out);
  });
  app.get('/me/donations', async (req) => ({ donations: await donations.mine(db, requireUser(req)) }));

  app.get('/me/radio-allowance', async (req) => donations.allowance(db, requireUser(req)));
  app.post('/me/radio-allocation-requests', async (req, reply) => {
    const userId = requireUser(req);
    return reply.code(201).send(await donations.requestAllocation(db, userId, donations.AllocationRequest.parse(req.body)));
  });

  app.get('/staff/radio-allocation-requests', async (req) => ({ requests: await donations.pendingRequests(db, requireUser(req)) }));
  app.post<{ Params: { id: string } }>('/staff/radio-allocation-requests/:id/decide', async (req) => {
    const staffId = requireUser(req);
    return withTx(db, (tx) => donations.decide(tx, staffId, req.params.id, donations.Decision.parse(req.body)));
  });

  app.get('/admin/donation-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await donations.settings(db), stripeKeySet: !!stripe, webhookSecretSet: !!stripe?.webhookSecret };
  });
  app.patch('/admin/donation-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await donations.updateSettings(db, donations.SettingsPatch.parse(req.body)) };
  });
  app.get('/admin/donations', async (req) => {
    await requireAdmin(req);
    return { donations: await donations.list(db) };
  });
  app.post('/admin/donations', async (req, reply) => {
    const adminId = await requireAdmin(req);
    const input = donations.ManualDonation.parse(req.body);
    return reply.code(201).send(await withTx(db, (tx) => donations.record(tx, adminId, input)));
  });
}
