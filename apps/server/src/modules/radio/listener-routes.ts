// Listener sign-up (listener-signup.ts), thank-you cards (qsl.ts) and the weekly station
// report (station-report.ts). The pages themselves are served with the website (site/routes.ts).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../../auth.js';
import { withTx, type Db } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import * as accounts from '../accounts/index.js';
import type { Mailer } from '../digest/mailer.js';
import * as signups from './listener-signup.js';
import * as qsl from './qsl.js';
import * as stationReport from './station-report.js';

export interface ListenerRouteOptions {
  mailer: Mailer | null;
  /** Open Circle's name, for its listeners' email. */
  openCircleName: string;
  /** PUBLIC_SITE_URL; null = the address each request came to. */
  siteUrl?: string | null;
}

/** Where links in email point: PUBLIC_SITE_URL, or the address this request came to (the website is served from the API host). */
export const originOf = (req: FastifyRequest, o: ListenerRouteOptions) => o.siteUrl || `${req.protocol}://${req.host}`;

const stationName = (edition: 'prayer-tower' | 'open-circle', o: ListenerRouteOptions) => (edition === 'open-circle' ? o.openCircleName : 'Prayer Tower');

/** Public, limited per IP address (app.ts): ask to become a listener, and make a key from a setup link. */
export function listenerPublicRoutes(app: FastifyInstance, db: Db) {
  app.post('/listeners/join', async (req, reply) => {
    if (!(await signups.enabled(db))) throw notFound('Listener sign-up');
    await signups.signUp(db, signups.SignUp.parse(req.body));
    reply.code(201);
    return { ok: true };
  });

  app.post<{ Params: { token: string } }>('/listeners/setup/:token/key', async (req) => {
    if (!(await signups.enabled(db))) throw notFound('Listener sign-up');
    return withTx(db, (tx) => signups.makeKey(tx, req.params.token));
  });
}

/** A node's confirmed reception: today's card, emailed to a listener who signed up (the first time each day). */
export async function cardFor(db: Db, req: FastifyRequest, node: { id: string }, report: { callSign: string; preset: string; snrDb: number }, matched: number, o: ListenerRouteOptions) {
  const card = await qsl.confirm(db, node.id, report, matched);
  if (!card) return undefined;
  const path = qsl.cardPath(card);
  if (card.new && card.email && o.mailer) {
    const mail = qsl.cardEmail(card, card.email, stationName(card.edition, o), `${originOf(req, o)}${path}`);
    // A failed email must not fail the listener's report; the card is still on the node's log.
    await o.mailer(mail).catch((err) => req.log.warn({ err }, 'thank-you card email failed'));
  }
  return { path, new: card.new };
}

/** Admin → Radio: listener requests and thank-you cards; the station report for admins and radio operators. */
export function listenerAdminRoutes(app: FastifyInstance, db: Db, o: ListenerRouteOptions) {
  const admin = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin'))) throw forbidden('Admins only');
    return userId;
  };
  const operator = async (req: FastifyRequest) => {
    const userId = requireUser(req);
    if (!(await accounts.hasRole(db, userId, 'admin', 'radio_operator'))) throw forbidden('Radio operators only');
    return userId;
  };
  const signupList = async () => ({ enabled: await signups.enabled(db), emailReady: !!o.mailer, signups: await signups.list(db) });

  app.get('/admin/listener-signups', async (req) => {
    await admin(req);
    return signupList();
  });
  app.patch('/admin/listener-signups', async (req) => {
    await admin(req);
    await signups.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return signupList();
  });
  // Approve: a new setup link, emailed when email is set up; the admin can always copy it.
  app.post<{ Params: { id: string } }>('/admin/listener-signups/:id/approve', async (req) => {
    const staffId = await admin(req);
    const id = z.uuid().parse(req.params.id);
    const { signup, setupPath } = await withTx(db, (tx) => signups.approve(tx, staffId, id));
    const setupUrl = `${originOf(req, o)}${setupPath}`;
    let emailed = false;
    if (o.mailer) {
      emailed = await o
        .mailer(signups.setupEmail(signup, stationName(signup.edition, o), setupUrl))
        .then(() => true)
        .catch((err) => (req.log.warn({ err }, 'listener setup email failed'), false));
    }
    return { signup, setupUrl, emailed };
  });
  app.post<{ Params: { id: string } }>('/admin/listener-signups/:id/decline', async (req) => {
    const staffId = await admin(req);
    return { signup: await signups.decline(db, staffId, z.uuid().parse(req.params.id)) };
  });
  app.delete<{ Params: { id: string } }>('/admin/listener-signups/:id', async (req) => {
    await admin(req);
    await signups.remove(db, z.uuid().parse(req.params.id));
    return { ok: true };
  });

  const cards = async () => ({ enabled: await qsl.enabled(db), cards: (await qsl.recent(db)).map((c) => ({ ...c, path: qsl.cardPath(c) })) });
  app.get('/admin/qsl-cards', async (req) => {
    await admin(req);
    return cards();
  });
  app.patch('/admin/qsl-cards', async (req) => {
    await admin(req);
    await qsl.setEnabled(db, z.object({ enabled: z.boolean() }).parse(req.body).enabled);
    return cards();
  });

  // Radio operators (the control operator) read it; only admins switch it.
  app.get('/admin/station-report', async (req) => {
    await operator(req);
    return stationReport.overview(db);
  });
  app.patch('/admin/station-report', async (req) => {
    await admin(req);
    await stationReport.updateSettings(db, z.object({ enabled: z.boolean().optional(), email: z.boolean().optional() }).parse(req.body));
    return stationReport.overview(db);
  });
}
