// Modem presets. All of them are OFDM with differential PSK on each carrier,
// the same family of waveform VARA FM uses (48 kHz sound card, 1,024-point
// FFT, 46.875 Hz carrier spacing, 1/8 guard): see docs/RADIO_BURST.md.
// Differential phase needs no channel estimate, so the FM radio's audio
// filters, pre-emphasis and de-emphasis only have to be steady across two
// symbols (48 ms).
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
  bitsPerSymbol: 1 | 2 | 3 | 4;
  /** Reed-Solomon parity bytes per 255-byte block (corrects half as many bad bytes). */
  parity: number;
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
  },
];

export function presetByName(name: string): BurstPreset {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) throw new Error(`unknown burst preset "${name}" (try ${PRESETS.map((x) => x.name).join(', ')})`);
  return p;
}

export const carriers = (p: BurstPreset) => p.lastBin - p.firstBin + 1;
export const symbolSamples = (p: BurstPreset) => p.fftSize + p.guard;
/** Raw channel bits per second, before error correction. */
export const rawBitRate = (p: BurstPreset) => (carriers(p) * p.bitsPerSymbol * p.sampleRate) / symbolSamples(p);
