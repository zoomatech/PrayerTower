// The setup wizard's tests (Admin → Radio → Setup wizard; docs/STATION_OPERATOR_GUIDE.md,
// "Setup wizard"). Between bursts the station asks Prayer Tower for a waiting test:
//   tone   a steady 1 kHz tone at the bursts' average level, for the operator to
//          set the sound card and radio levels against the radio's ALC meter
//   burst  one short test frame, "Station test <code>", that a listener node
//          decodes and reports by its fingerprint like any prayer
// and reports what happened. A failed test unkeys and is reported; it never
// stops the station, since the operator is watching the wizard.
import { planFrames } from './burst/burst.js';
import { SAMPLE_RATE } from './burst/ofdm.js';
import type { BurstPreset } from './burst/presets.js';
import { fingerprint } from './burst/sha256.js';
import type { BurstTransmitter } from './burst/transmit.js';

export interface SetupTest {
  id: string;
  kind: 'tone' | 'burst';
  seconds: number;
  code: string;
}

export interface SetupResult {
  ok: boolean;
  callSign: string;
  error?: string;
  preset?: string;
  sentHash?: string;
  peakDbfs?: number;
}

export interface SetupApi {
  setupTest(callSign: string): Promise<SetupTest | null>;
  setupResult(id: string, r: SetupResult): Promise<void>;
}

/** A burst's RMS level (buildBurst normalises to this), so the tone sets levels for real bursts. */
export const BURST_RMS = 0.2;
export const TONE_HZ = 1000;

/** A sine at the bursts' RMS, with 20 ms raised-cosine edges so it doesn't click. */
export function toneAudio(seconds: number, hz = TONE_HZ, rate = SAMPLE_RATE, rms = BURST_RMS): Float32Array {
  const n = Math.round(seconds * rate);
  const edge = Math.min(Math.round(0.02 * rate), Math.floor(n / 2));
  const amp = rms * Math.SQRT2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = i < edge ? i / edge : i >= n - edge ? (n - 1 - i) / edge : 1;
    out[i] = amp * (0.5 - 0.5 * Math.cos(Math.PI * k)) * Math.sin((2 * Math.PI * hz * i) / rate);
  }
  return out;
}

export const peakDbfs = (audio: Float32Array) => {
  const peak = audio.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  return peak ? Math.round(20 * Math.log10(peak) * 10) / 10 : -200;
};

/** The test burst's one line of text; the code makes its fingerprint unique. */
export const testText = (code: string) => `Station test ${code}`;

/** Run at most one waiting test. Returns what ran, or null when none was waiting. Errors are reported, then logged. */
export async function runSetupTestOnce(
  api: SetupApi,
  tx: BurstTransmitter,
  cfg: { callSign: string; preset: BurstPreset; choosePreset?: () => Promise<BurstPreset>; maxFrameSeconds: number },
  log: (m: string) => void = console.log,
): Promise<SetupTest['kind'] | null> {
  const test = await api.setupTest(cfg.callSign);
  if (!test) return null;
  let result: SetupResult;
  try {
    if (test.kind === 'tone') {
      if (!tx.sendAudio) throw new Error(`BURST_MODE=${tx.mode} can't play a tone; use fldigi's TUNE button instead`);
      const audio = toneAudio(test.seconds);
      log(`[setup] test tone, ${test.seconds} s at ${TONE_HZ} Hz`);
      await tx.sendAudio(audio, SAMPLE_RATE);
      result = { ok: true, callSign: cfg.callSign, peakDbfs: peakDbfs(audio) };
    } else {
      const preset = cfg.choosePreset ? await cfg.choosePreset() : cfg.preset;
      const text = testText(test.code);
      log(`[setup] test burst "${text}" on ${preset.name}`);
      await tx.send(planFrames([text], preset, cfg.maxFrameSeconds), preset, cfg.callSign);
      result = { ok: true, callSign: cfg.callSign, preset: preset.name, sentHash: fingerprint(text) };
    }
  } catch (err) {
    await tx.stop().catch(() => undefined);
    result = { ok: false, callSign: cfg.callSign, error: String((err as Error).message ?? err).slice(0, 500) };
    log(`[setup] test ${test.kind} failed: ${result.error}`);
  }
  await api.setupResult(test.id, result).catch((err: Error) => log(`[setup] could not report the test: ${err.message}`));
  return test.kind;
}
