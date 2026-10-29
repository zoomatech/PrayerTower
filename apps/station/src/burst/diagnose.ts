// Decode replay and diagnostics (docs/RADIO_BURST.md, "Diagnose a weak signal"):
// replays a recording through the decoder the way a receiver would, then says
// why it did or didn't decode: the audio level, clipping, hum and noise, each
// frame's measured SNR against its preset's working level, and whether an
// off-tune HF receiver or the packet fallback explains it. Works offline on a
// saved recording. No Node APIs: the listening page bundles this too.
import { demodulate as demodulatePackets } from '../packet/afsk.js';
import { parseStatus } from '../packet/message.js';
import { fft } from './fft.js';
import { demodulate, SAMPLE_RATE } from './ofdm.js';
import { PRESETS } from './presets.js';
import { resample } from './wav.js';

export interface DiagnosedFrame {
  callSign: string;
  preset: string;
  snrDb: number;
  /** The preset's working SNR (presets.ts minSnrDb); margin = snrDb - this. */
  needDb: number | null;
  corrected: boolean;
  startSeconds: number;
  endSeconds: number;
}

export interface Diagnosis {
  seconds: number;
  sampleRate: number;
  peakDbfs: number;
  rmsDbfs: number;
  /** Share of samples at or above 0.99 full scale. */
  clippedPercent: number;
  dcOffset: number;
  /** Level of the quietest and loudest tenth of 50 ms windows: the noise floor and the signal. */
  noiseFloorDbfs: number;
  signalDbfs: number;
  /** Share of the audio's power below 300 Hz (hum, rumble), in 300-3000 Hz (the radio's passband) and above. */
  bands: { low: number; voice: number; high: number };
  frames: DiagnosedFrame[];
  /** Frames found only when allowing an off-tune HF receiver (up to searchHz). */
  searchHz: number;
  packets: number;
  advice: string[];
}

const db = (x: number) => (x > 0 ? Math.round(20 * Math.log10(x) * 10) / 10 : -120);
const pct = (x: number) => Math.round(x * 1000) / 10;

function percentile(sorted: number[], p: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : 0;
}

/** Power share below 300 Hz, 300-3000 Hz and above, averaged over 4096-sample blocks. */
function bandShares(x: Float32Array, rate: number) {
  const n = 4096;
  const sums = { low: 0, voice: 0, high: 0 };
  const blocks = Math.min(200, Math.floor(x.length / n));
  const step = blocks ? Math.floor(x.length / blocks) : 0;
  for (let b = 0; b < blocks; b++) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = x[b * step + i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    fft(re, im);
    for (let k = 1; k < n / 2; k++) {
      const hz = (k * rate) / n;
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      if (hz < 300) sums.low += p;
      else if (hz <= 3000) sums.voice += p;
      else sums.high += p;
    }
  }
  const total = sums.low + sums.voice + sums.high || 1;
  return { low: pct(sums.low / total), voice: pct(sums.voice / total), high: pct(sums.high / total) };
}

/** Replay `samples` (recorded at `rate`) through the burst and packet decoders and explain the result. */
export function diagnose(samples: Float32Array, rate: number, opts: { searchHz?: number } = {}): Diagnosis {
  let peak = 0;
  let sum = 0;
  let sq = 0;
  let clipped = 0;
  for (const v of samples) {
    const a = Math.abs(v);
    if (a > peak) peak = a;
    if (a >= 0.99) clipped++;
    sum += v;
    sq += v * v;
  }
  const len = samples.length || 1;
  const win = Math.max(1, Math.round(rate * 0.05));
  const levels: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0;
    for (let j = i; j < i + win; j++) s += samples[j]! * samples[j]!;
    levels.push(Math.sqrt(s / win));
  }
  levels.sort((a, b) => a - b);

  const audio = resample(samples, rate, SAMPLE_RATE);
  const toFrame = (f: ReturnType<typeof demodulate>[number]): DiagnosedFrame => {
    const preset = PRESETS.find((p) => p.name === f.preset);
    return {
      callSign: f.callSign,
      preset: f.preset,
      snrDb: Math.round(f.snrDb * 10) / 10,
      needDb: preset?.minSnrDb ?? null,
      corrected: f.corrected,
      startSeconds: Math.round((f.start / SAMPLE_RATE) * 100) / 100,
      endSeconds: Math.round((f.end / SAMPLE_RATE) * 100) / 100,
    };
  };
  let frames = demodulate(audio, 0.4, 0).map(toFrame);
  let searchHz = 0;
  if (!frames.length && (opts.searchHz ?? 50) > 0) {
    searchHz = opts.searchHz ?? 50;
    frames = demodulate(audio, 0.4, searchHz).map(toFrame);
    if (!frames.length) searchHz = 0;
  }
  const packets = demodulatePackets(samples, rate).filter((p) => parseStatus(p.frame)).length;

  const d: Diagnosis = {
    seconds: Math.round((samples.length / rate) * 100) / 100,
    sampleRate: rate,
    peakDbfs: db(peak),
    rmsDbfs: db(Math.sqrt(sq / len)),
    clippedPercent: pct(clipped / len),
    dcOffset: Math.round((sum / len) * 1000) / 1000,
    noiseFloorDbfs: db(percentile(levels, 0.1)),
    signalDbfs: db(percentile(levels, 0.9)),
    bands: bandShares(samples, rate),
    frames,
    searchHz,
    packets,
    advice: [],
  };
  d.advice = advise(d);
  return d;
}

/** Plain-language next steps, most likely cause first. */
export function advise(d: Diagnosis): string[] {
  const out: string[] = [];
  if (d.peakDbfs <= -40) out.push(`The recording is very quiet (peak ${d.peakDbfs} dBFS). Turn up the receiver's audio or the sound card's capture level until bursts peak around -10 dBFS.`);
  if (d.clippedPercent >= 0.1) out.push(`${d.clippedPercent}% of the samples are clipped. Turn the capture level (or the radio's volume) down until the peaks stay under -3 dBFS.`);
  if (Math.abs(d.dcOffset) >= 0.05) out.push(`The audio sits off center (DC offset ${d.dcOffset}). A faulty cable or sound card input can do this.`);
  if (d.bands.low >= 30) out.push(`${d.bands.low}% of the power is below 300 Hz: hum or rumble. Check for a ground loop (an isolation transformer on the audio cable fixes most).`);
  if (d.signalDbfs - d.noiseFloorDbfs < 6 && d.peakDbfs > -40) out.push('No burst stands out from the noise. Check the radio is on the station frequency with squelch open, or record closer to the station.');
  if (d.searchHz) out.push(`Frames decoded only when allowing for tuning up to ${d.searchHz} Hz off. Retune the receiver, or keep BURST_SEARCH_HZ=${d.searchHz} (on /listen, tick "Shortwave (SSB) radio").`);
  for (const f of d.frames) {
    if (f.needDb === null) continue;
    const margin = Math.round((f.snrDb - f.needDb) * 10) / 10;
    if (margin < 3) out.push(`${f.callSign} on ${f.preset} at ${f.startSeconds}s measured ${f.snrDb} dB, only ${margin} dB above what the preset needs (${f.needDb} dB). A more robust preset, or BURST_PRESET=auto, would be safer.`);
  }
  if (d.frames.some((f) => f.corrected)) out.push('Error correction had to repair some frames: the link works but is near its limit.');
  if (!d.frames.length && d.packets) out.push(`No bursts, but ${d.packets} packet fallback status packet(s) decoded: this station is sending BURST_MODE=packet.`);
  if (!d.frames.length && !d.packets && !out.length) out.push('Nothing decoded, and the level and noise look normal. The recording may not contain a burst; record a little before the station keys up until a little after.');
  if (!out.length) out.push('Everything decoded with a comfortable margin.');
  return out;
}

/** The diagnosis as lines of text, for the CLI and the listening page. */
export function report(d: Diagnosis): string[] {
  const lines = [
    `Recording: ${d.seconds} s at ${d.sampleRate} Hz`,
    `Level: peak ${d.peakDbfs} dBFS, average ${d.rmsDbfs} dBFS, ${d.clippedPercent}% clipped, DC offset ${d.dcOffset}`,
    `Noise floor ${d.noiseFloorDbfs} dBFS, loudest parts ${d.signalDbfs} dBFS`,
    `Power: ${d.bands.low}% below 300 Hz, ${d.bands.voice}% in 300-3000 Hz, ${d.bands.high}% above`,
    `Burst frames: ${d.frames.length}${d.searchHz ? ` (with a ${d.searchHz} Hz tuning search)` : ''}; packet fallback packets: ${d.packets}`,
    ...d.frames.map(
      (f) =>
        `  ${f.startSeconds}-${f.endSeconds}s de ${f.callSign}, ${f.preset}, ${f.snrDb} dB SNR${f.needDb !== null ? ` (needs ${f.needDb})` : ''}${f.corrected ? ', errors corrected' : ''}`,
    ),
    'Advice:',
    ...d.advice.map((a) => `  - ${a}`),
  ];
  return lines;
}
