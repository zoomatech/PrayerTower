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
import * as nodes from './nodes.js';

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
    if (given.length && (await nodes.multiStation(db))) {
      return (await nodes.authenticate(db, given.toString(), 'station').catch(() => null))?.id ?? fail();
    }
    if (!stationKey) throw new AppError(503, 'station_disabled', 'No radio station is configured (STATION_API_KEY)');
    return fail();
  };
  const fail = (): never => {
    throw new AppError(401, 'unauthenticated', 'Bad station key');
  };

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
    const { max } = z.object({ max: z.number().int().min(1).max(500).default(50) }).parse(req.body ?? {});
    await ops.beat(db, 'station');
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

  // A listener node heard the station: what it measured (never the prayers' words).
  app.post('/node/channel-report', async (req) => {
    const node = await nodes.authenticate(db, req.headers['x-node-key'] as string | undefined, 'listener');
    if (!(await nodes.enabled(db))) throw notFound('Listener reports');
    await nodes.recordReport(db, node.id, nodes.ChannelReportInput.parse(req.body));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/station/radio-prayers/:id/result', async (req) => {
    const node = await requireStation(req);
    const result = radio.StationResult.parse(req.body);
    await withTx(db, (tx) => radio.reportResult(tx, req.params.id, result, node));
    return { ok: true };
  });
}
