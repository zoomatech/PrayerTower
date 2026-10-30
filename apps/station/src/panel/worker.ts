// The station's SSTV loop (BURST_MODE=sstv; docs/RADIO_BURST.md, "Prayer panel"): claim a batch
// like burst mode, pack it into prayer panels (panel.ts) and send each as an SSTV Robot 36
// picture (sstv.ts) through the sound card, with the same PTT as burst audio mode. Prayers that
// don't fit one panel go in the next, straight after. Prayer Tower must have the prayer panel
// switched on (Admin → Radio); otherwise claims are refused and the station waits.
import { foldAscii, passesFilter } from '../text.js';
import { reportWithRetry, REPORT_RETRY_MS, TransmitError, type StationApi } from '../worker.js';
import { fingerprint } from '../burst/sha256.js';
import type { BurstTransmitter } from '../burst/transmit.js';
import { decodeBatch } from '../burst/codec.js';
import { decodePanelImage, encodePanel, panelImage } from './panel.js';
import { decodeRobot36, encodeRobot36, HEIGHT, WIDTH } from './sstv.js';

export const SSTV_PRESET = 'sstv-robot36';
export const SAMPLE_RATE = 48_000;

export interface SstvConfig {
  callSign: string;
  maxPrayers: number;
  blocklist: readonly string[];
  frequencyHz?: number;
}

export type SstvOutcome = { kind: 'idle' } | { kind: 'sent'; sent: number; rejected: number; panels: number; seconds: number } | { kind: 'rejected'; rejected: number };

export async function runSstvOnce(
  api: StationApi,
  tx: BurstTransmitter,
  cfg: SstvConfig,
  log: (m: string) => void = console.log,
  retryMs: number[] = REPORT_RETRY_MS,
): Promise<SstvOutcome> {
  if (!api.claimBatch || !tx.sendAudio) throw new Error('SSTV mode needs burst claims and a sound card (BURST_MODE=sstv)');
  const claimed = await api.claimBatch(cfg.maxPrayers, 'panel');
  if (!claimed.length) return { kind: 'idle' };
  const ok: { id: string; text: string }[] = [];
  for (const p of claimed) {
    if (passesFilter(p.text, cfg.blocklist)) ok.push({ id: p.id, text: foldAscii(p.text) });
    else {
      log(`[sstv] ${p.id} rejected by the content filter (97.113(a)(4))`);
      await reportWithRetry(api, p.id, { ok: false, callSign: cfg.callSign, error: 'rejected by station content filter' }, retryMs);
    }
  }
  const rejected = claimed.length - ok.length;
  if (!ok.length) return { kind: 'rejected', rejected };
  let panels = 0;
  let seconds = 0;
  for (let at = 0; at < ok.length; ) {
    const batch = ok.slice(at);
    const panel = encodePanel(batch.map((p) => p.text), cfg.callSign);
    // A prayer too long for a panel of its own still goes, cut to what fits.
    const count = Math.max(1, panel.count);
    const audio = encodeRobot36(panelImage(panel.count ? panel.cells : encodePanel([batch[0]!.text.slice(0, 300)], cfg.callSign).cells).gray, SAMPLE_RATE);
    const sending = batch.slice(0, count);
    try {
      // The station ID (STATION_ID=cw) follows the picture when one is due, as after a burst.
      await tx.sendAudio(audio, SAMPLE_RATE, { label: 'sstv', stationId: true });
    } catch (err) {
      await tx.stop().catch(() => undefined);
      const message = String((err as Error).message ?? err).slice(0, 500);
      for (const p of ok.slice(at)) await reportWithRetry(api, p.id, { ok: false, callSign: cfg.callSign, error: message }, retryMs).catch(() => undefined);
      throw new TransmitError(message);
    }
    // Practice mode: read the picture back as a receiver would, so the log shows what went out.
    if (tx.mode === 'simulate') {
      const pic = decodeRobot36(audio, SAMPLE_RATE);
      const frame = pic && decodePanelImage(pic.gray, WIDTH, HEIGHT);
      const heard = frame ? decodeBatch(frame.batch) : [];
      log(`[simulate] a receiver reads ${heard.length} prayer(s) from the picture${frame ? ` (de ${frame.callSign})` : ''}`);
    }
    for (const p of sending) {
      await reportWithRetry(api, p.id, { ok: true, callSign: cfg.callSign, pieces: 1, preset: SSTV_PRESET, sentHash: fingerprint(p.text), frequencyHz: cfg.frequencyHz }, retryMs);
    }
    panels++;
    seconds += audio.length / SAMPLE_RATE;
    at += count;
  }
  log(`[sstv] ${ok.length} prayer(s) sent in ${panels} panel(s), ${seconds.toFixed(1)} s`);
  return { kind: 'sent', sent: ok.length, rejected, panels, seconds };
}
