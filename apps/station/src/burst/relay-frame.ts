// The relay envelope (codec 5; docs/RADIO_BURST.md, "Store-and-forward relay").
// A relay re-sends a frame it heard under its own call sign (its own legal
// identification) and wraps the original batch so every receiver still knows
// which station it came from, and how many relays it has passed through:
//   byte 0   5 (the codec number)
//   byte 1   hops so far (1 after the first relay)
//   byte 2   n, the origin call sign's length (3-10), then n ASCII bytes
//   rest     the original batch, codec byte first (never another envelope)
// No Node APIs: the listening page bundles this too.
export const RELAYED = 5;
export const MAX_HOPS = 3;

export interface Relayed {
  origin: string;
  hops: number;
  inner: Uint8Array;
}

export function wrapRelay(inner: Uint8Array, origin: string, hops: number): Uint8Array {
  const call = origin.toUpperCase();
  if (!/^[A-Z0-9/-]{3,10}$/.test(call)) throw new Error(`"${origin}" is not a call sign`);
  if (!Number.isInteger(hops) || hops < 1 || hops > MAX_HOPS) throw new Error(`hops must be 1-${MAX_HOPS}`);
  if (inner[0] === RELAYED || !inner.length) throw new Error('only an original batch can be relayed');
  return Uint8Array.from([RELAYED, hops, call.length, ...Array.from(call, (c) => c.charCodeAt(0)), ...inner]);
}

/** The envelope's contents, or null for any other batch or a malformed envelope. */
export function unwrapRelay(batch: Uint8Array): Relayed | null {
  if (batch[0] !== RELAYED || batch.length < 4) return null;
  const hops = batch[1]!;
  const n = batch[2]!;
  if (hops < 1 || hops > MAX_HOPS || n < 3 || n > 10 || batch.length < 3 + n + 1) return null;
  const origin = String.fromCharCode(...batch.subarray(3, 3 + n));
  const inner = batch.subarray(3 + n);
  if (!/^[A-Z0-9/-]{3,10}$/.test(origin) || inner[0] === RELAYED) return null;
  return { origin, hops, inner };
}
