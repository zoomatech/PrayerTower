// The packet fallback's station loop (BURST_MODE=packet): claim a batch like
// burst mode, but send only each prayer's short ID and the count, as APRS
// status packets in standard 1200-baud AFSK (afsk.ts, message.ts), through the
// sound card with the same PTT as burst audio mode. Prayer Tower must have the
// packet fallback switched on (Admin → Radio); otherwise claims are refused and
// the station waits.
import { foldAscii, passesFilter } from '../text.js';
import { reportWithRetry, REPORT_RETRY_MS, TransmitError, type StationApi } from '../worker.js';
import { fingerprint } from '../burst/sha256.js';
import type { BurstTransmitter } from '../burst/transmit.js';
import { encodeFrame, modulate } from './afsk.js';
import { PACKET_PRESET, shortId, statusFrames } from './message.js';

export interface PacketConfig {
  callSign: string;
  maxPrayers: number;
  blocklist: readonly string[];
  /** PACKET_PATH, e.g. WIDE1-1; empty (the default) asks no digipeater to repeat it. */
  path: string[];
  frequencyHz?: number;
}

export type PacketOutcome = { kind: 'idle' } | { kind: 'sent'; sent: number; rejected: number; packets: number; seconds: number } | { kind: 'rejected'; rejected: number };

export const SAMPLE_RATE = 48_000;

export async function runPacketOnce(
  api: StationApi,
  tx: BurstTransmitter,
  cfg: PacketConfig,
  log: (m: string) => void = console.log,
  retryMs: number[] = REPORT_RETRY_MS,
): Promise<PacketOutcome> {
  if (!api.claimBatch || !tx.sendAudio) throw new Error('Packet mode needs burst claims and a sound card (BURST_MODE=packet)');
  const claimed = await api.claimBatch(cfg.maxPrayers, 'packet');
  if (!claimed.length) return { kind: 'idle' };
  const ok = [];
  for (const p of claimed) {
    if (passesFilter(p.text, cfg.blocklist)) ok.push(p);
    else {
      log(`[packet] ${p.id} rejected by the content filter (97.113(a)(4))`);
      await reportWithRetry(api, p.id, { ok: false, callSign: cfg.callSign, error: 'rejected by station content filter' }, retryMs);
    }
  }
  const rejected = claimed.length - ok.length;
  if (!ok.length) return { kind: 'rejected', rejected };
  const hashes = ok.map((p) => fingerprint(foldAscii(p.text)));
  const frames = statusFrames(cfg.callSign, hashes.map(shortId), cfg.path);
  const audio = modulate(frames.map(encodeFrame), SAMPLE_RATE);
  try {
    await tx.sendAudio(audio, SAMPLE_RATE);
  } catch (err) {
    await tx.stop().catch(() => undefined);
    const message = String((err as Error).message ?? err).slice(0, 500);
    for (const p of ok) await reportWithRetry(api, p.id, { ok: false, callSign: cfg.callSign, error: message }, retryMs).catch(() => undefined);
    throw new TransmitError(message);
  }
  for (const [i, p] of ok.entries()) {
    await reportWithRetry(api, p.id, { ok: true, callSign: cfg.callSign, pieces: frames.length, preset: PACKET_PRESET, sentHash: hashes[i], frequencyHz: cfg.frequencyHz }, retryMs);
  }
  const seconds = audio.length / SAMPLE_RATE;
  log(`[packet] ${ok.length} prayer ID(s) sent in ${frames.length} packet(s), ${seconds.toFixed(2)} s`);
  return { kind: 'sent', sent: ok.length, rejected, packets: frames.length, seconds };
}
