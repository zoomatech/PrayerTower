// The batch codec: many prayers in, one compressed byte string out.
// Prayers are folded to printable ASCII by the station before they get here,
// so a newline can separate them. The first byte names the codec, so a
// receiver never has to guess; every codec is an openly published standard.
import { brotliCompressSync, brotliDecompressSync, constants, deflateRawSync, inflateRawSync } from 'node:zlib';
import { cmCompress, cmDecompress, cmFit, MAX_TEXT } from './cm.js';
import { DICTIONARY_V1 } from './dictionary.js';
import { PRIMER_V1 } from './primer.js';
import { PRIMER_V2_EXTRA } from './primer2.js';
import { unwrapRelay } from './relay-frame.js';

export enum Codec {
  /** The prayers as plain ASCII, newline separated. */
  Plain = 0,
  /** Raw DEFLATE (RFC 1951) primed with DICTIONARY_V1. */
  DeflateDict1 = 1,
  /** Brotli (RFC 7932), which has its own built-in English dictionary. */
  Brotli = 2,
  /** Context mixing (cm.ts) primed with PRIMER_V1 then DICTIONARY_V1: usually a third smaller than DEFLATE. */
  ContextMix1 = 3,
  /**
   * Context mixing version 2 (cm.ts): two more models, mixer weights chosen by
   * the last byte's kind, and an APM stage, primed with PRIMER_V1, PRIMER_V2_EXTRA
   * and DICTIONARY_V1. About 5-20% smaller than codec 3. Off unless
   * BURST_CODEC_V2=on, since receivers older than it can't read it.
   */
  ContextMix2 = 4,
  /** Not a compressor: a relay's envelope around another station's batch (relay-frame.ts). */
  Relayed = 5,
}

const dictionary = Buffer.from(DICTIONARY_V1, 'latin1');
const primer = Buffer.from(PRIMER_V1 + DICTIONARY_V1, 'latin1');
const primer2 = Buffer.from(PRIMER_V1 + PRIMER_V2_EXTRA + DICTIONARY_V1, 'latin1');

function compress(codec: Codec, text: Buffer): Buffer {
  switch (codec) {
    case Codec.Plain:
      return text;
    case Codec.DeflateDict1:
      return deflateRawSync(text, { level: 9, memLevel: 9, windowBits: 15, dictionary });
    case Codec.Brotli:
      return brotliCompressSync(text, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
          [constants.BROTLI_PARAM_SIZE_HINT]: text.length,
        },
      });
    case Codec.ContextMix1:
      return Buffer.from(cmCompress(text, primer, 'v1'));
    case Codec.ContextMix2:
      return Buffer.from(cmCompress(text, primer2, 'v2', 2));
    case Codec.Relayed:
      throw new Error('a relay envelope wraps a batch; it is not a compressor');
  }
}

const ALL = [Codec.Plain, Codec.DeflateDict1, Codec.Brotli, Codec.ContextMix1];
/** BURST_CODEC_V2=on: codec 4 joins the others (every receiver must be updated first). */
export const ALL_V2 = [...ALL, Codec.ContextMix2];

/** Compress a batch with every codec (or the ones given) and keep the smallest. Byte 0 is the codec. */
export function encodeBatch(prayers: readonly string[], codecs: readonly Codec[] = ALL): Uint8Array {
  const text = Buffer.from(prayers.join('\n'), 'latin1');
  let best: Buffer | null = null;
  for (const codec of codecs) {
    const body = compress(codec, text);
    if (!best || body.length + 1 < best.length) best = Buffer.concat([Buffer.from([codec]), body]);
  }
  return new Uint8Array(best!);
}

/** How many of the prayers fit in a batch of at most maxBytes (codec 3's or, with v2, codec 4's size, which the final encode can only beat). */
export function fitBatch(prayers: readonly string[], maxBytes: number, v2 = false): number {
  const pieces = prayers.map((p) => Buffer.from(p, 'latin1'));
  return v2 ? cmFit(pieces, primer2, 'v2', maxBytes - 1, 2) : cmFit(pieces, primer, 'v1', maxBytes - 1);
}

export function decodeBatch(bytes: Uint8Array): string[] {
  if (bytes[0] === Codec.Relayed) {
    const r = unwrapRelay(bytes);
    if (!r) throw new Error('bad relay envelope');
    return decodeBatch(r.inner);
  }
  const codec = bytes[0];
  const body = Buffer.from(bytes.subarray(1));
  let text: Buffer;
  if (codec === Codec.Plain) text = body;
  // DEFLATE and Brotli can expand a thousand times; a damaged or hostile batch stops at MAX_TEXT.
  else if (codec === Codec.DeflateDict1) text = inflateRawSync(body, { dictionary, maxOutputLength: MAX_TEXT });
  else if (codec === Codec.Brotli) text = brotliDecompressSync(body, { maxOutputLength: MAX_TEXT });
  else if (codec === Codec.ContextMix1) text = Buffer.from(cmDecompress(body, primer, 'v1'));
  else if (codec === Codec.ContextMix2) text = Buffer.from(cmDecompress(body, primer2, 'v2', 2));
  else throw new Error(`unknown codec ${codec}`);
  const s = text.toString('latin1');
  return s ? s.split('\n') : [];
}
