// The station loop: claim a prayer from Prayer Tower, filter it, fold it to
// ASCII, split it into call-signed pieces, send each through fldigi, report.
// Any transmit error disables transmit (rx_only) and stops the worker, as the
// build paper requires; a person restarts it after checking the station.
import type { Fldigi } from './fldigi.js';
import { foldAscii, passesFilter, splitPieces } from './text.js';

export interface ClaimedPrayer {
  id: string;
  text: string;
  repeats?: number;
}

export interface BurstLog {
  callSign: string;
  mode: 'audio' | 'fldigi' | 'simulate';
  preset: string;
  prayers: number;
  frames: number;
  bytes: number;
  seconds: number;
  decoded: number | null;
  ok: boolean;
  error?: string;
}

export interface StationApi {
  claim(): Promise<ClaimedPrayer | null>;
  /** Up to `max` prayers at once (burst mode); empty when none are waiting. */
  claimBatch?(max: number): Promise<ClaimedPrayer[]>;
  report(id: string, result: { ok: boolean; callSign: string; pieces?: number; error?: string; preset?: string; sentHash?: string }): Promise<void>;
  /** Log a burst for Admin → Radio (burst mode). Best effort: a failure here never stops the station. */
  reportBurst?(burst: BurstLog): Promise<void>;
}

export interface StationConfig {
  callSign: string;
  modem: string;
  maxPieceChars: number;
  txTimeoutMs: number;
  blocklist: readonly string[];
}

export type Outcome = 'idle' | 'sent' | 'rejected';

/**
 * Report a result, retrying for about half a minute. A report that never
 * arrives leaves the prayer "sending", and after 15 minutes Prayer Tower hands
 * it out again, so a prayer that already went out would be transmitted twice.
 */
export async function reportWithRetry(api: StationApi, id: string, result: Parameters<StationApi['report']>[1], waitMs: number[]) {
  for (let i = 0; ; i++) {
    try {
      return await api.report(id, result);
    } catch (err) {
      if (i >= waitMs.length) throw err;
      await new Promise((r) => setTimeout(r, waitMs[i]));
    }
  }
}
export const REPORT_RETRY_MS = [2_000, 4_000, 8_000, 16_000];

/** The radio side failed: transmit was disabled and the station should stop until a person checks it. */
export class TransmitError extends Error {}

/** Handle at most one prayer. Throws (after rx_only and a failure report) if transmitting fails. */
export async function runOnce(
  api: StationApi,
  fldigi: Fldigi,
  cfg: StationConfig,
  log: (m: string) => void = console.log,
  retryMs: number[] = REPORT_RETRY_MS,
): Promise<Outcome> {
  const prayer = await api.claim();
  if (!prayer) return 'idle';
  if (!passesFilter(prayer.text, cfg.blocklist)) {
    log(`[station] ${prayer.id} rejected by the content filter (97.113(a)(4))`);
    await reportWithRetry(api, prayer.id, { ok: false, callSign: cfg.callSign, error: 'rejected by station content filter' }, retryMs);
    return 'rejected';
  }
  // Amplify: the same call-signed pieces, sent `repeats` times.
  const once = splitPieces(foldAscii(prayer.text), cfg.maxPieceChars, cfg.callSign);
  const pieces = Array.from({ length: Math.max(1, Math.min(prayer.repeats ?? 1, 50)) }, () => once).flat();
  try {
    for (const piece of pieces) await fldigi.transmit(piece, cfg.txTimeoutMs);
  } catch (err) {
    await fldigi.rxOnly().catch(() => undefined);
    const message = String((err as Error).message ?? err).slice(0, 500);
    await reportWithRetry(api, prayer.id, { ok: false, callSign: cfg.callSign, error: message }, retryMs).catch(() => undefined);
    throw new TransmitError(message);
  }
  await reportWithRetry(api, prayer.id, { ok: true, callSign: cfg.callSign, pieces: pieces.length }, retryMs);
  log(`[station] ${prayer.id} sent in ${pieces.length} piece(s)`);
  return 'sent';
}

/** Prayer Tower's station API (POST /station/claim, POST /station/radio-prayers/:id/result). */
export function httpApi(baseUrl: string, stationKey: string, fetchImpl: typeof fetch = fetch): StationApi {
  const post = (path: string, body: object = {}) =>
    fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-station-key': stationKey },
      body: JSON.stringify(body),
    });
  return {
    async claim() {
      const res = await post('/station/claim');
      if (res.status === 204) return null;
      const json = (await res.json().catch(() => ({}))) as { radioPrayer?: { id: string; text: string; repeats?: number }; message?: string };
      if (!res.ok) throw new Error(`claim failed (${res.status}): ${json.message ?? ''}`);
      return json.radioPrayer ?? null;
    },
    async claimBatch(max) {
      const res = await post('/station/claim-batch', { max });
      if (res.status === 204) return [];
      // An older server without burst claims: take one prayer at a time instead.
      if (res.status === 404) {
        const out: ClaimedPrayer[] = [];
        while (out.length < max) {
          const p = await this.claim();
          if (!p) break;
          out.push(p);
        }
        return out;
      }
      const json = (await res.json().catch(() => ({}))) as { radioPrayers?: ClaimedPrayer[]; message?: string };
      if (!res.ok) throw new Error(`claim-batch failed (${res.status}): ${json.message ?? ''}`);
      return json.radioPrayers ?? [];
    },
    async report(id, result) {
      const res = await post(`/station/radio-prayers/${id}/result`, result);
      if (!res.ok) throw new Error(`report failed (${res.status})`);
    },
    async reportBurst(burst) {
      const res = await post('/station/bursts', burst);
      if (!res.ok) throw new Error(`burst log failed (${res.status})`);
    },
  };
}
