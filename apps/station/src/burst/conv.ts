// Inner error correction for the "-fec" presets: the rate-1/2,
// constraint-length-7 convolutional code NASA and CCSDS use (generators 171 and 133 octal),
// optionally punctured to rate 2/3, decoded with a soft-decision Viterbi
// decoder. Soft decisions use how sure the demodulator is of each bit, which
// buys several dB over the hard decisions Reed-Solomon sees alone.
const K = 7;
const STATES = 1 << (K - 1);
const G1 = 0o171;
const G2 = 0o133;
const parity = (x: number) => {
  let p = 0;
  for (; x; x &= x - 1) p ^= 1;
  return p;
};
// Output bits for (state, input): the register holds the input then the state's 6 bits.
const OUT = new Uint8Array(STATES * 2 * 2);
for (let s = 0; s < STATES; s++) {
  for (let b = 0; b < 2; b++) {
    const reg = (b << 6) | s;
    OUT[(s * 2 + b) * 2] = parity(reg & G1);
    OUT[(s * 2 + b) * 2 + 1] = parity(reg & G2);
  }
}
const next = (s: number, b: number) => ((b << 6) | s) >> 1;

export type InnerCode = 'r12' | 'r23';
/** Which of each pair of coded bits are sent: rate 2/3 drops every second G2 bit. */
const PUNCTURE: Record<InnerCode, number[]> = { r12: [1, 1], r23: [1, 1, 1, 0] };

/** Coded (sent) bit count for a payload of `bytes` bytes, including the 6-bit tail. */
export function codedBits(bytes: number, code: InnerCode): number {
  const pattern = PUNCTURE[code];
  const all = (bytes * 8 + K - 1) * 2;
  let n = 0;
  for (let i = 0; i < all; i++) if (pattern[i % pattern.length]) n++;
  return n;
}

/** Bytes (MSB first) to punctured coded bits, flushed back to state 0 with K-1 zero bits. */
export function convEncode(data: Uint8Array, code: InnerCode): Uint8Array {
  const pattern = PUNCTURE[code];
  const out = new Uint8Array(codedBits(data.length, code));
  let s = 0;
  let i = 0;
  let o = 0;
  const push = (b: number) => {
    const base = (s * 2 + b) * 2;
    for (const bit of [OUT[base]!, OUT[base + 1]!]) if (pattern[i++ % pattern.length]) out[o++] = bit;
    s = next(s, b);
  };
  for (const byte of data) for (let k = 7; k >= 0; k--) push((byte >> k) & 1);
  for (let k = 0; k < K - 1; k++) push(0);
  return out;
}

/**
 * Soft-decision Viterbi. `llr` holds one value per sent bit: positive means a
 * 0 is more likely, negative a 1, and the size is the confidence.
 */
export function convDecode(llr: Float32Array, bytes: number, code: InnerCode): Uint8Array {
  const pattern = PUNCTURE[code];
  const steps = bytes * 8 + K - 1;
  // Put punctured positions back as "no idea" (0).
  const full = new Float32Array(steps * 2);
  for (let i = 0, j = 0; i < full.length; i++) if (pattern[i % pattern.length]) full[i] = llr[j++] ?? 0;
  let metric = new Float64Array(STATES).fill(-Infinity);
  metric[0] = 0;
  let nextMetric = new Float64Array(STATES);
  const from = new Uint8Array(steps * STATES); // surviving predecessor's low bit info
  for (let t = 0; t < steps; t++) {
    nextMetric.fill(-Infinity);
    const l0 = full[2 * t]!;
    const l1 = full[2 * t + 1]!;
    for (let s = 0; s < STATES; s++) {
      const m = metric[s]!;
      if (m === -Infinity) continue;
      for (let b = 0; b < 2; b++) {
        const base = (s * 2 + b) * 2;
        // Correlation metric: +llr when the branch's bit is 0, -llr when it is 1.
        const branch = (OUT[base] ? -l0 : l0) + (OUT[base + 1] ? -l1 : l1);
        const ns = next(s, b);
        const cand = m + branch;
        if (cand > nextMetric[ns]!) {
          nextMetric[ns] = cand;
          from[t * STATES + ns] = s & 1; // the bit shifted out tells which predecessor
        }
      }
    }
    [metric, nextMetric] = [nextMetric, metric];
  }
  // Trace back from state 0 (the tail flushed the encoder there).
  const bits = new Uint8Array(steps);
  let s = 0;
  for (let t = steps - 1; t >= 0; t--) {
    bits[t] = s >> 5; // the newest input bit sits at the top of the state
    s = ((s << 1) & (STATES - 1)) | from[t * STATES + s]!;
  }
  const out = new Uint8Array(bytes);
  for (let i = 0; i < bytes * 8; i++) if (bits[i]) out[i >> 3]! |= 0x80 >> (i & 7);
  return out;
}

/** A fixed permutation spreading neighbouring coded bits across carriers and symbols. */
export function interleaver(n: number): Uint32Array {
  let step = Math.max(1, Math.round(n * 0.618034));
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  while (gcd(step, n) !== 1) step++;
  return Uint32Array.from({ length: n }, (_, i) => (i * step) % n);
}
