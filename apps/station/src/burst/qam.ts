// Coherent payload for the "-qam" presets (docs/RADIO_BURST.md, "Coherent
// QAM payload"). Unlike the differential presets, each carrier's value stands
// on its own: Gray-coded QPSK, 16-QAM or 64-QAM, read against a channel
// estimate. Every sixth carrier (and the top one) is a pilot with a known
// value, so the receiver can measure each carrier's gain and phase symbol by
// symbol. Coherent detection avoids the noise differential detection doubles,
// and lets amplitude carry bits too, which is worth several dB at high rates.

/** Pilot spacing in carriers. */
export const PILOT_EVERY = 6;

export const isPilot = (k: number, c: number) => k % PILOT_EVERY === 0 || k === c - 1;

export function dataCarriers(c: number): number {
  let n = 0;
  for (let k = 0; k < c; k++) if (!isPilot(k, c)) n++;
  return n;
}

/** Pilot phase on carrier k of payload symbol s: the reference symbol's phase, turned a quarter turn per (s*k) step. */
export const pilotPhase = (ref: number[], s: number, k: number) => ref[k]! + (((s * (k + 1)) % 4) * Math.PI) / 2;

/** Levels per axis and the scale that gives the constellation an average power of 1. */
function axis(bits: number): { levels: number; scale: number } {
  const levels = 1 << (bits / 2);
  return { levels, scale: 1 / Math.sqrt((2 * (levels * levels - 1)) / 3) };
}

/** Gray-coded square QAM: the high half of the bits picks the in-phase level, the low half the quadrature level. */
export function qamPoint(value: number, bits: number): [number, number] {
  const { levels, scale } = axis(bits);
  const half = bits / 2;
  const level = (g: number) => {
    let i = g;
    for (let m = g >> 1; m; m >>= 1) i ^= m; // Gray to index
    return (2 * i - (levels - 1)) * scale;
  };
  return [level(value >> half), level(value & (levels - 1))];
}

/**
 * Max-log soft bits for an equalized point (zr, zi), most significant bit
 * first, appended to out: positive means a 0 is more likely. `weight` is the
 * carrier's signal-to-noise ratio, so faded carriers count for less.
 */
export function qamSoft(zr: number, zi: number, bits: number, weight: number, out: number[]): void {
  const { levels, scale } = axis(bits);
  const half = bits / 2;
  for (const z of [zr, zi]) {
    for (let j = half - 1; j >= 0; j--) {
      let d0 = Infinity;
      let d1 = Infinity;
      for (let i = 0; i < levels; i++) {
        const d = (z - (2 * i - (levels - 1)) * scale) ** 2;
        if (((i ^ (i >> 1)) >> j) & 1) d1 = Math.min(d1, d);
        else d0 = Math.min(d0, d);
      }
      out.push((d1 - d0) * weight);
    }
  }
}

/** Nearest constellation point to an equalized value. */
export function qamSlice(zr: number, zi: number, bits: number): [number, number] {
  const { levels, scale } = axis(bits);
  const cut = (z: number) => {
    const i = Math.max(0, Math.min(levels - 1, Math.round((z / scale + (levels - 1)) / 2)));
    return (2 * i - (levels - 1)) * scale;
  };
  return [cut(zr), cut(zi)];
}
