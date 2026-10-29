/**
 * The recording with any broken samples (NaN or Infinity, from a sound card
 * dropout or a bad driver) set to silence. A handful of them would otherwise
 * spread through every filter and FFT and cost the whole recording; silence
 * costs only those few milliseconds, which the error correction absorbs.
 * Returns the same array when every sample is fine.
 */
export function finiteSamples(x: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i]!)) return x.map((s) => (Number.isFinite(s) ? s : 0));
  }
  return x;
}
