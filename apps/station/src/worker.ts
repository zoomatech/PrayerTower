// The station loop: claim a prayer from Prayer Tower, filter it, fold it to
// ASCII, split it into call-signed pieces, send each through fldigi, report.
// Any transmit error disables transmit (rx_only) and stops the worker, as the
// build paper requires; a person restarts it after checking the station.
import type { Fldigi } from './fldigi.js';
import { foldAscii, passesFilter, splitPieces } from './text.js';

export interface StationApi {
  claim(): Promise<{ id: string; text: string } | null>;
  report(id: string, result: { ok: boolean; callSign: string; pieces?: number; error?: string }): Promise<void>;
}

export interface StationConfig {
  callSign: string;
  modem: string;
  maxPieceChars: number;
  txTimeoutMs: number;
  blocklist: readonly string[];
}

export type Outcome = 'idle' | 'sent' | 'rejected';

/** The radio side failed: transmit was disabled and the station should stop until a person checks it. */
export class TransmitError extends Error {}

/** Handle at most one prayer. Throws (after rx_only and a failure report) if transmitting fails. */
export async function runOnce(api: StationApi, fldigi: Fldigi, cfg: StationConfig, log: (m: string) => void = console.log): Promise<Outcome> {
  const prayer = await api.claim();
  if (!prayer) return 'idle';
  if (!passesFilter(prayer.text, cfg.blocklist)) {
    log(`[station] ${prayer.id} rejected by the content filter (97.113(a)(4))`);
    await api.report(prayer.id, { ok: false, callSign: cfg.callSign, error: 'rejected by station content filter' });
    return 'rejected';
  }
  const pieces = splitPieces(foldAscii(prayer.text), cfg.maxPieceChars, cfg.callSign);
  try {
    for (const piece of pieces) await fldigi.transmit(piece, cfg.txTimeoutMs);
  } catch (err) {
    await fldigi.rxOnly().catch(() => undefined);
    const message = String((err as Error).message ?? err).slice(0, 500);
    await api.report(prayer.id, { ok: false, callSign: cfg.callSign, error: message }).catch(() => undefined);
    throw new TransmitError(message);
  }
  await api.report(prayer.id, { ok: true, callSign: cfg.callSign, pieces: pieces.length });
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
      const json = (await res.json().catch(() => ({}))) as { radioPrayer?: { id: string; text: string }; message?: string };
      if (!res.ok) throw new Error(`claim failed (${res.status}): ${json.message ?? ''}`);
      return json.radioPrayer ?? null;
    },
    async report(id, result) {
      const res = await post(`/station/radio-prayers/${id}/result`, result);
      if (!res.ok) throw new Error(`report failed (${res.status})`);
    },
  };
}
