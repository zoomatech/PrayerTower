// Public radio routes that need no sign-in, limited per IP address (app.ts).
import type { FastifyInstance } from 'fastify';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { notFound } from '../../errors.js';
import * as radio from '../radio/index.js';
import * as prayingToo from '../radio/praying-too.js';
import * as receipts from '../radio/receipts.js';

/** Listener mode: the app's Listen screen without an account (needs the listening page on too). */
export async function listenerMode(db: Db) {
  const { rows } = await db.query<{ on: boolean }>('select listener_mode_enabled as on from public.token_settings');
  const s = await radio.stationSettings(db);
  const enabled = rows[0]!.on && s.listen_page_enabled;
  return { enabled, receipts: enabled && (await receipts.enabled(db)), prayingToo: enabled && (await prayingToo.enabled(db)) };
}

export async function setListenerMode(db: Db, on: boolean) {
  await db.query('update public.token_settings set listener_mode_enabled = $1', [on]);
}

export function listenPublicRoutes(app: FastifyInstance, db: Db) {
  // Signed out: whether the sign-in screen offers "Listen to radio prayers".
  app.get('/listen/config', async () => listenerMode(db));

  // A listener heard these prayers (fingerprints only): tells their senders, while receipts are on.
  app.post('/listen/heard', async (req) => {
    if (!(await receipts.enabled(db))) throw notFound('Radio receipts');
    const report = receipts.HeardReport.parse(req.body);
    return { matched: await withTx(db, (tx) => receipts.heard(tx, report)) };
  });

  // "I'm praying too" from a listener: fingerprints only, an anonymous count (404 while switched off).
  app.post('/listen/praying', async (req) => {
    if (!(await prayingToo.enabled(db))) throw notFound("I'm praying too");
    const report = prayingToo.PrayingReport.parse(req.body);
    return { matched: await withTx(db, (tx) => prayingToo.prayingToo(tx, report)) };
  });
}
