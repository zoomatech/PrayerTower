// Modem presets. All of them are OFDM with differential PSK on each carrier,
// the same family of waveform VARA FM uses (48 kHz sound card, 1,024-point
// FFT, 46.875 Hz carrier spacing, 1/8 guard): see docs/RADIO_BURST.md.
// Differential phase needs no channel estimate, so the FM radio's audio
// filters, pre-emphasis and de-emphasis only have to be steady across two
// symbols (48 ms).
import type { InnerCode } from './conv.js';
import { dataCarriers } from './qam.js';

export interface BurstPreset {
  /** One byte on air; receivers try every preset they know. */
  id: number;
  name: string;
  description: string;
  sampleRate: number;
  /** FFT size; carrier spacing is sampleRate / fftSize. */
  fftSize: number;
  /** Cyclic prefix in samples. */
  guard: number;
  /** First and last FFT bin carrying data (inclusive). */
  firstBin: number;
  lastBin: number;
  /** Bits per carrier per symbol: 1 = DBPSK, 2 = DQPSK, 3 = D8PSK, 4 = D16PSK. */
  bitsPerSymbol: 1 | 2 | 3 | 4 | 6;
  /** Reed-Solomon parity bytes per 255-byte block (corrects half as many bad bytes). */
  parity: number;
  /** Lowest SNR in 2.5 kHz (dB) where it still decodes reliably on a simulated channel; the auto picker adds a margin. */
  minSnrDb: number;
  /** Inner convolutional code with soft-decision decoding (the "-fec" presets); none when absent. */
  inner?: InnerCode;
  /** 'qam': coherent Gray-coded QAM with pilot carriers (qam.ts) instead of differential PSK. Needs an inner code. */
  modulation?: 'qam';
  /** 'coded': the frame header goes through the rate-1/2 code too (HF presets; ofdm.ts). */
  header?: 'coded';
}

const base = { sampleRate: 48_000, fftSize: 1024, guard: 128 } as const;

export const PRESETS: readonly BurstPreset[] = [
  {
    ...base,
    id: 1,
    name: 'fm-robust',
    description: 'Any FM radio\'s mic/speaker audio, weak or noisy paths. 48 carriers 750-2953 Hz, DBPSK, ~2.0 kbit/s raw.',
    firstBin: 16,
    lastBin: 63,
    bitsPerSymbol: 1,
    parity: 48,
    minSnrDb: 6,
  },
  {
    ...base,
    id: 2,
    name: 'fm-standard',
    description: 'Any FM radio\'s mic/speaker audio, solid signal. 48 carriers 750-2953 Hz, DQPSK, ~4.0 kbit/s raw.',
    firstBin: 16,
    lastBin: 63,
    bitsPerSymbol: 2,
    parity: 32,
    minSnrDb: 11,
  },
  {
    ...base,
    id: 3,
    name: 'fm-fast',
    description: 'FM audio with a strong, clean signal. 48 carriers 750-2953 Hz, D8PSK, ~6.0 kbit/s raw.',
    firstBin: 16,
    lastBin: 63,
    bitsPerSymbol: 3,
    parity: 32,
    minSnrDb: 16,
  },
  {
    ...base,
    id: 4,
    name: 'dataport-fast',
    description: 'A radio\'s 9600 data port (flat audio, no pre-emphasis) or an SDR. 104 carriers 375-5203 Hz, D8PSK, ~13 kbit/s raw.',
    firstBin: 8,
    lastBin: 111,
    bitsPerSymbol: 3,
    parity: 32,
    minSnrDb: 19,
  },
  {
    ...base,
    id: 5,
    name: 'fm-turbo',
    description: 'FM audio, full-quieting signal and a well-set audio level. 55 carriers 563-3094 Hz, D16PSK, ~9.2 kbit/s raw.',
    firstBin: 12,
    lastBin: 66,
    bitsPerSymbol: 4,
    parity: 32,
    minSnrDb: 22,
  },
  {
    ...base,
    id: 6,
    name: 'dataport-turbo',
    description: 'A 9600 data port or SDR with a strong signal. 104 carriers 375-5203 Hz, D16PSK, ~17 kbit/s raw.',
    firstBin: 8,
    lastBin: 111,
    bitsPerSymbol: 4,
    parity: 32,
    minSnrDb: 24,
  },
  {
    ...base,
    id: 7,
    name: 'fm-robust-fec',
    description: 'Weakest FM paths: faster than fm-robust and about 1 dB tougher: DQPSK with a rate-1/2 convolutional code and soft decoding. 48 carriers 750-2953 Hz, ~2.0 kbit/s of data.',
    firstBin: 16,
    lastBin: 63,
    bitsPerSymbol: 2,
    parity: 16,
    minSnrDb: 5,
    inner: 'r12',
  },
  {
    ...base,
    id: 8,
    name: 'fm-turbo-fec',
    description: 'Faster than fm-fast and about 1 dB tougher: D16PSK with a rate-2/3 convolutional code and soft decoding. 55 carriers 563-3094 Hz, ~6.1 kbit/s of data.',
    firstBin: 12,
    lastBin: 66,
    bitsPerSymbol: 4,
    parity: 16,
    minSnrDb: 15,
    inner: 'r23',
  },
  {
    ...base,
    id: 9,
    name: 'fm-qam16',
    description: 'FM audio, about 20% faster than fm-standard at the same signal: coherent 16-QAM with pilots and a rate-3/4 convolutional code. 48 carriers 750-2953 Hz, ~4.9 kbit/s of data.',
    firstBin: 16,
    lastBin: 63,
    bitsPerSymbol: 4,
    parity: 16,
    minSnrDb: 12,
    inner: 'r34',
    modulation: 'qam',
  },
  {
    ...base,
    id: 10,
    name: 'fm-qam64',
    description: 'FM audio, fm-turbo speed on a signal fm-fast needs: coherent 64-QAM with pilots and a rate-3/4 convolutional code. 55 carriers 563-3094 Hz, ~8.5 kbit/s of data.',
    firstBin: 12,
    lastBin: 66,
    bitsPerSymbol: 6,
    parity: 16,
    minSnrDb: 18,
    inner: 'r34',
    modulation: 'qam',
  },
  {
    ...base,
    id: 11,
    name: 'dataport-qam64',
    description: 'A 9600 data port or SDR, dataport-turbo speed on about 4 dB less signal: coherent 64-QAM with pilots, rate 3/4. 104 carriers 375-5203 Hz, ~16 kbit/s of data.',
    firstBin: 8,
    lastBin: 111,
    bitsPerSymbol: 6,
    parity: 16,
    minSnrDb: 20,
    inner: 'r34',
    modulation: 'qam',
  },
  // HF (shortwave) SSB: carriers inside a 300-2700 Hz filter, DPSK (no channel
  // estimate to lose in a fade), the rate-1/2 or 2/3 code with soft decoding
  // and a coded header (header: 'coded'), so multipath notches and the edge of
  // the SSB filter cost scattered soft bits. minSnrDb here is for the CCIR 520
  // "moderate" fading channel (hf-channel.ts), not a steady one.
  {
    ...base,
    id: 12,
    name: 'hf-robust',
    description: 'HF SSB, weak or fading paths: DBPSK with a rate-1/2 code and a coded header. 46 carriers 469-2578 Hz, ~0.9 kbit/s of data.',
    firstBin: 10,
    lastBin: 55,
    bitsPerSymbol: 1,
    parity: 16,
    minSnrDb: 8,
    inner: 'r12',
    header: 'coded',
  },
  {
    ...base,
    id: 13,
    name: 'hf-standard',
    description: 'HF SSB, fair paths: DQPSK with a rate-1/2 code and a coded header. 46 carriers 469-2578 Hz, ~1.8 kbit/s of data.',
    firstBin: 10,
    lastBin: 55,
    bitsPerSymbol: 2,
    parity: 16,
    minSnrDb: 12,
    inner: 'r12',
    header: 'coded',
  },
  {
    ...base,
    id: 14,
    name: 'hf-fast',
    description: 'HF SSB, good paths: DQPSK with a rate-2/3 code and a coded header. 46 carriers 469-2578 Hz, ~2.4 kbit/s of data.',
    firstBin: 10,
    lastBin: 55,
    bitsPerSymbol: 2,
    parity: 16,
    minSnrDb: 15,
    inner: 'r23',
    header: 'coded',
  },
];

export function presetByName(name: string): BurstPreset {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`unknown burst preset "${name}" (try ${PRESETS.map((x) => x.name).join(', ')})`);
  return p;
}

export const carriers = (p: BurstPreset) => p.lastBin - p.firstBin + 1;
/** Carriers that carry payload bits: all of them, less the pilots on a QAM preset. */
export const payloadCarriers = (p: BurstPreset) => (p.modulation === 'qam' ? dataCarriers(carriers(p)) : carriers(p));
export const symbolSamples = (p: BurstPreset) => p.fftSize + p.guard;
/** Raw channel bits per second, before error correction. */
export const rawBitRate = (p: BurstPreset) => (payloadCarriers(p) * p.bitsPerSymbol * p.sampleRate) / symbolSamples(p);
