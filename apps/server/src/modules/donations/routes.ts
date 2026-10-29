import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { AppError, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as donations from './index.js';
import * as zeffy from './zeffy.js';

/** No sign-in: whether giving is on, the public summary, and Stripe's and Zeffy's webhooks. */
export function donationPublicRoutes(app: FastifyInstance, db: Db, stripe: donations.StripeKeys | null, zeffyKeys: zeffy.ZeffyKeys | null = null) {
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

  // Zeffy → Settings → Integrations → webhook address: …/donations/zeffy-webhook?token=ZEFFY_WEBHOOK_TOKEN.
  // Only the payment ID is read from the body; the payment itself comes from Zeffy's API.
  app.post<{ Querystring: { token?: string } }>('/donations/zeffy-webhook', async (req, reply) => {
    if (!zeffyKeys?.webhookToken) throw new AppError(503, 'not_configured', 'Zeffy webhooks are not set up (ZEFFY_API_KEY, ZEFFY_WEBHOOK_TOKEN)');
    if (!zeffy.tokenMatches(req.query.token, zeffyKeys.webhookToken)) return reply.code(401).send({ error: 'bad_token', message: 'Bad webhook token' });
    const id = zeffy.webhookPaymentId(req.body);
    if (!id) return { received: true, result: 'skipped' };
    return { received: true, result: await withTx(db, (tx) => zeffy.syncPayment(tx, zeffyKeys, id)) };
  });
}

export function donationRoutes(app: FastifyInstance, db: Db, stripe: donations.StripeKeys | null, webAppUrl: string | null, zeffyKeys: zeffy.ZeffyKeys | null = null) {
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
    return {
      settings: await donations.settings(db), stripeKeySet: !!stripe, webhookSecretSet: !!stripe?.webhookSecret,
      zeffyKeySet: !!zeffyKeys, zeffyWebhookSet: !!zeffyKeys?.webhookToken,
    };
  });
  app.patch('/admin/donation-settings', async (req) => {
    await requireAdmin(req);
    return { settings: await donations.updateSettings(db, donations.SettingsPatch.parse(req.body)) };
  });
  app.get('/admin/donations', async (req) => {
    await requireAdmin(req);
    return { donations: await donations.list(db) };
  });
  // A gift returned outside Stripe (a Zeffy or manual gift). Stripe refunds arrive by webhook.
  app.post<{ Params: { id: string } }>('/admin/donations/:id/refund', async (req) => {
    const adminId = await requireAdmin(req);
    if (!(await withTx(db, (tx) => donations.refund(tx, req.params.id, adminId)))) throw notFound('Paid gift');
    return { refunded: true };
  });
  // Catch up on Zeffy gifts from the last 30 days (any webhook that was missed).
  app.post('/admin/donations/zeffy-sync', async (req) => {
    await requireAdmin(req);
    if (!zeffyKeys) throw new AppError(503, 'not_configured', 'Zeffy is not connected (ZEFFY_API_KEY)');
    return withTx(db, (tx) => zeffy.syncRecent(tx, zeffyKeys));
  });
  app.post('/admin/donations', async (req, reply) => {
    const adminId = await requireAdmin(req);
    const input = donations.ManualDonation.parse(req.body);
    return reply.code(201).send(await withTx(db, (tx) => donations.record(tx, adminId, input)));
  });
}
