// The radio station's API. The station authenticates with STATION_API_KEY
// (header x-station-key), not a member login, and only ever sees request text.
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { AppError, notFound } from '../../errors.js';
import * as ops from '../ops/index.js';
import * as health from './health.js';
import * as radio from './index.js';
import * as acks from './acks.js';
import * as bandPlan from './band-plan.js';
import { cardFor, type ListenerRouteOptions } from './listener-routes.js';
import * as receipts from './receipts.js';
import * as nodes from './nodes.js';
import * as setup from './setup.js';
import * as sky from './sky.js';
import * as coverage from './coverage.js';
import * as packet from './packet.js';
import * as panel from './panel.js';

export function stationRoutes(app: FastifyInstance, db: Db, stationKey: string | null) {
  /**
   * The main station's STATION_API_KEY gives null; with several stations on, a
   * station node's own key gives its id (radio/nodes.ts). Anything else is refused.
   */
  const requireStation = async (req: FastifyRequest): Promise<string | null> => {
    const given = Buffer.from(String(req.headers['x-station-key'] ?? ''));
    if (stationKey) {
      const want = Buffer.from(stationKey);
      if (given.length === want.length && timingSafeEqual(given, want)) return null;
    }
    // An extra station's own key; authenticate refuses an empty or unknown key.
    const node = (await nodes.multiStation(db)) ? await nodes.authenticate(db, given.toString(), 'station').catch(() => null) : null;
    if (node) return node.id;
    if (!stationKey) throw new AppError(503, 'station_disabled', 'No radio station is configured (STATION_API_KEY)');
    return fail();
  };
  const fail = (): never => {
    throw new AppError(401, 'unauthenticated', 'Bad station key');
  };

  // The band plan's pick for the next burst (band-plan.ts; BAND_PLAN=server on the station); 204 while the plan is off or empty.
  app.get('/station/band', async (req, reply) => {
    await requireStation(req);
    const pick = await bandPlan.current(db);
    if (!pick) return reply.code(204).send();
    return pick;
  });

  // Claim the next prayer to send; 204 when there is nothing to send.
  app.post('/station/claim', async (req, reply) => {
    const node = await requireStation(req);
    await ops.beat(db, 'station');
    const next = await withTx(db, (tx) => radio.claimNext(tx, node));
    if (!next) return reply.code(204).send();
    return { radioPrayer: next };
  });

  // Burst mode: several prayers at once (at most the admin's radio_batch_max); 204 when there are none.
  app.post('/station/claim-batch', async (req, reply) => {
    const node = await requireStation(req);
    const { max, mode } = z.object({ max: z.number().int().min(1).max(500).default(50), mode: z.enum(['burst', 'packet', 'panel']).default('burst') }).parse(req.body ?? {});
    await ops.beat(db, 'station');
    // A packet station waits until the packet fallback is switched on (packet.ts).
    if (mode === 'packet' && !(await packet.enabled(db))) throw new AppError(409, 'packet_off', 'The packet fallback is switched off (Admin → Radio)');
    // An SSTV station waits until the prayer panel is switched on (panel.ts).
    if (mode === 'panel' && !(await panel.enabled(db))) throw new AppError(409, 'panel_off', 'The prayer panel is switched off (Admin → Radio)');
    const batch = await withTx(db, (tx) => radio.claimBatch(tx, max, node));
    if (!batch.length) return reply.code(204).send();
    return { radioPrayers: batch };
  });

  // Burst mode: one log line per burst, shown in Admin → Radio.
  app.post('/station/bursts', async (req) => {
    await requireStation(req);
    await radio.recordBurst(db, radio.BurstReport.parse(req.body));
    return { ok: true };
  });

  // The station's own checks (audio device, rig/PTT), about once a minute, for Admin → Radio alerts.
  app.post('/station/status', async (req) => {
    await requireStation(req);
    await ops.beat(db, 'station');
    await health.recordStatus(db, health.StationStatus.parse(req.body));
    return { ok: true };
  });

  // BURST_PRESET=auto: the weakest fresh listener report of this call sign (nodes.ts); 204 when none.
  app.get<{ Querystring: { callSign?: string } }>('/station/channel', async (req, reply) => {
    await requireStation(req);
    const { callSign } = z.object({ callSign: z.string().trim().min(3).max(20) }).parse(req.query);
    const report = (await nodes.enabled(db)) ? await nodes.channelFor(db, callSign) : null;
    if (!report) return reply.code(204).send();
    return report;
  });

  // The setup wizard's next tone or test burst (setup.ts); 204 when none or the wizard is off.
  app.get<{ Querystring: { callSign?: string } }>('/station/setup-test', async (req, reply) => {
    await requireStation(req);
    const callSign = z.string().trim().min(3).max(20).optional().parse(req.query.callSign);
    const test = await setup.claim(db, callSign ?? null);
    if (!test) return reply.code(204).send();
    return { test };
  });

  // Where to point the dish (sky.ts), for a station with a rotator (ROTATOR=rotctld); 204 while off.
  app.get('/station/sky', async (req, reply) => {
    await requireStation(req);
    const p = await sky.now(db);
    if (!p) return reply.code(204).send();
    return { az: p.az, el: p.el, target: p.target, aboveMinimum: p.aboveMinimum };
  });

  app.post<{ Params: { id: string } }>('/station/setup-test/:id/result', async (req) => {
    await requireStation(req);
    await setup.report(db, z.string().uuid().parse(req.params.id), setup.SetupResult.parse(req.body));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/station/radio-prayers/:id/result', async (req) => {
    const node = await requireStation(req);
    const result = radio.StationResult.parse(req.body);
    await withTx(db, (tx) => radio.reportResult(tx, req.params.id, result, node));
    return { ok: true };
  });
}

/** Listener nodes' reports (own keys, x-node-key), registered with a per-address rate limit in app.ts. */
export function nodeRoutes(app: FastifyInstance, db: Db, listeners: ListenerRouteOptions = { mailer: null, openCircleName: 'Open Circle' }) {
  // A listener node heard the station: what it measured (never the prayers' words).
  app.post('/node/channel-report', async (req) => {
    const node = await nodes.authenticateRequest(db, req, 'listener');
    if (!(await nodes.enabled(db))) throw notFound('Listener reports');
    await nodes.recordReport(db, node.id, nodes.ChannelReportInput.parse(req.body));
    return { ok: true };
  });

  // A listener node decoded these prayers (fingerprints only): acknowledges them (acks.ts) and, with receipts on, tells their senders.
  app.post('/node/heard', async (req) => {
    const node = await nodes.authenticateRequest(db, req, 'listener');
    const wizard = await setup.testsActive(db);
    const on = wizard || (await nodes.enabled(db)) || (await acks.settings(db)).enabled || (await receipts.enabled(db));
    if (!on) throw notFound('Listener acknowledgements');
    const report = receipts.HeardReport.parse(req.body);
    // A setup wizard test burst (setup.ts) is not a prayer: it never reaches receipts.
    const tests = wizard ? await setup.heard(db, report, node.name) : 0;
    const matched = await withTx(db, (tx) => receipts.heard(tx, report, { id: node.id, name: node.name }));
    // Prayers the station really sent: a thank-you card (qsl.ts), while cards are on.
    const card = await cardFor(db, req, node, report, matched, listeners);
    return { matched: matched + tests, ...(card ? { card } : {}) };
  });

  // A listener decoded the packet fallback's short IDs (packet.ts): heard, like a burst receipt.
  app.post('/node/heard-ids', async (req) => {
    const node = await nodes.authenticateRequest(db, req, 'listener');
    if (!(await packet.enabled(db))) throw notFound('Packet fallback');
    const report = packet.HeardIds.parse(req.body);
    return { matched: await withTx(db, (tx) => packet.heardIds(tx, report, { id: node.id, name: node.name })) };
  });

  // About once a minute, so acknowledgements know a listener is running (authenticate marks it seen).
  // A node that opted in (NODE_LOCATION) adds its approximate location for the coverage map (coverage.ts).
  app.post('/node/heartbeat', async (req) => {
    const node = await nodes.authenticateRequest(db, req, 'listener');
    const { location, relay, receiver } = z
      .object({ location: coverage.Location.optional(), relay: nodes.RelayStatus.optional(), receiver: nodes.Receiver.optional() })
      .parse(req.body ?? {});
    if (location) await coverage.fromNode(db, node.id, location);
    if (receiver) await nodes.recordReceiver(db, node.id, receiver);
    if (relay) await nodes.recordRelay(db, node.id, relay);
    return { ok: true };
  });
}
