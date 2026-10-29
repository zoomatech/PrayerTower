// Burst mode's station loop: claim a batch of prayers, filter and fold each
// one, compress them together, send them in one key-up, report each one.
// A transmit error unkeys, reports every prayer in the batch as failed and
// stops the worker, the same as the one-prayer PSK31 loop.
import { foldAscii, passesFilter } from '../text.js';
import { reportWithRetry, REPORT_RETRY_MS, TransmitError, type BurstLog, type ClaimedPrayer, type StationApi } from '../worker.js';
import { planFrames } from './burst.js';
import type { BurstPreset } from './presets.js';
import type { BurstTransmitter, SentBurst } from './transmit.js';

export interface BurstConfig {
  callSign: string;
  preset: BurstPreset;
  /** Most prayers claimed per burst (the server may hand out fewer). */
  maxPrayers: number;
  /** Longest single frame on the air; a bigger batch becomes several frames in the same key-up. */
  maxFrameSeconds: number;
  blocklist: readonly string[];
}

export type BurstOutcome = { kind: 'idle' } | { kind: 'sent'; sent: number; rejected: number; frames: number; seconds: number } | { kind: 'rejected'; rejected: number };

/** An amplified prayer appears `repeats` times; the copies cost almost nothing after compression. */
const MAX_REPEATS = 50;

export async function runBurstOnce(
  api: StationApi,
  tx: BurstTransmitter,
  cfg: BurstConfig,
  log: (m: string) => void = console.log,
  retryMs: number[] = REPORT_RETRY_MS,
): Promise<BurstOutcome> {
  const claimed: ClaimedPrayer[] = api.claimBatch ? await api.claimBatch(cfg.maxPrayers) : await claimOneByOne(api, cfg.maxPrayers);
  if (!claimed.length) return { kind: 'idle' };

  const ok: ClaimedPrayer[] = [];
  for (const p of claimed) {
    if (passesFilter(p.text, cfg.blocklist)) ok.push(p);
    else {
      log(`[burst] ${p.id} rejected by the content filter (97.113(a)(4))`);
      await reportWithRetry(api, p.id, { ok: false, callSign: cfg.callSign, error: 'rejected by station content filter' }, retryMs);
    }
  }
  const rejected = claimed.length - ok.length;
  if (!ok.length) return { kind: 'rejected', rejected };

  const texts = ok.flatMap((p) => Array<string>(Math.max(1, Math.min(p.repeats ?? 1, MAX_REPEATS))).fill(foldAscii(p.text)));
  const batches = planFrames(texts, cfg.preset, cfg.maxFrameSeconds);
  const logBurst = (b: Omit<BurstLog, 'callSign' | 'mode' | 'preset' | 'prayers'>) =>
    api
      .reportBurst?.({ callSign: cfg.callSign, mode: tx.mode, preset: cfg.preset.name, prayers: texts.length, ...b })
      .catch((err: Error) => log(`[burst] could not log the burst: ${err.message}`));
  let sent: SentBurst;
  try {
    sent = await tx.send(batches, cfg.preset, cfg.callSign);
  } catch (err) {
    await tx.stop().catch(() => undefined);
    const message = String((err as Error).message ?? err).slice(0, 500);
    for (const p of ok) await reportWithRetry(api, p.id, { ok: false, callSign: cfg.callSign, error: message }, retryMs).catch(() => undefined);
    await logBurst({ frames: batches.length, bytes: batches.reduce((n, b) => n + b.length, 0), seconds: 0, decoded: null, ok: false, error: message });
    throw new TransmitError(message);
  }
  for (const p of ok) await reportWithRetry(api, p.id, { ok: true, callSign: cfg.callSign, pieces: sent.frames }, retryMs);
  await logBurst({ ...sent, seconds: Math.round(sent.seconds * 100) / 100, ok: true });
  log(`[burst] ${ok.length} prayer(s) sent in ${sent.frames} frame(s), ${sent.seconds.toFixed(2)} s, ${cfg.preset.name}`);
  return { kind: 'sent', sent: ok.length, rejected, frames: sent.frames, seconds: sent.seconds };
}

async function claimOneByOne(api: StationApi, max: number): Promise<ClaimedPrayer[]> {
  const out: ClaimedPrayer[] = [];
  while (out.length < max) {
    const p = await api.claim();
    if (!p) break;
    out.push(p);
  }
  return out;
}
