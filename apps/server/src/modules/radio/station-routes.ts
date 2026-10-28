// The radio station's API. The station authenticates with STATION_API_KEY
// (header x-station-key), not a member login, and only ever sees request text.
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '../../db.js';
import { withTx } from '../../db.js';
import { AppError } from '../../errors.js';
import * as radio from './index.js';

export function stationRoutes(app: FastifyInstance, db: Db, stationKey: string | null) {
  const requireStation = async (req: FastifyRequest) => {
    if (!stationKey) throw new AppError(503, 'station_disabled', 'No radio station is configured (STATION_API_KEY)');
    const given = Buffer.from(String(req.headers['x-station-key'] ?? ''));
    const want = Buffer.from(stationKey);
    if (given.length !== want.length || !timingSafeEqual(given, want)) throw new AppError(401, 'unauthenticated', 'Bad station key');
  };

  // Claim the next prayer to send; 204 when there is nothing to send.
  app.post('/station/claim', async (req, reply) => {
    await requireStation(req);
    const next = await withTx(db, (tx) => radio.claimNext(tx));
    if (!next) return reply.code(204).send();
    return { radioPrayer: next };
  });

  app.post<{ Params: { id: string } }>('/station/radio-prayers/:id/result', async (req) => {
    await requireStation(req);
    const result = radio.StationResult.parse(req.body);
    await withTx(db, (tx) => radio.reportResult(tx, req.params.id, result));
    return { ok: true };
  });
}
