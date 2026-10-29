// The batch codec: many prayers in, one compressed byte string out.
// Prayers are folded to printable ASCII by the station before they get here,
// so a newline can separate them. The first byte names the codec, so a
// receiver never has to guess; every codec is an openly published standard.
import { brotliCompressSync, brotliDecompressSync, constants, deflateRawSync, inflateRawSync } from 'node:zlib';
import { DICTIONARY_V1 } from './dictionary.js';

export enum Codec {
  /** The prayers as plain ASCII, newline separated. */
  Plain = 0,
  /** Raw DEFLATE (RFC 1951) primed with DICTIONARY_V1. */
  DeflateDict1 = 1,
  /** Brotli (RFC 7932), which has its own built-in English dictionary. */
  Brotli = 2,
}

const dictionary = Buffer.from(DICTIONARY_V1, 'latin1');

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
  }
}

/** Compress a batch with every codec and keep the smallest. Byte 0 is the codec. */
export function encodeBatch(prayers: readonly string[]): Uint8Array {
  const text = Buffer.from(prayers.join('\n'), 'latin1');
  let best: Buffer | null = null;
  for (const codec of [Codec.Plain, Codec.DeflateDict1, Codec.Brotli]) {
    const body = compress(codec, text);
    if (!best || body.length + 1 < best.length) best = Buffer.concat([Buffer.from([codec]), body]);
  }
  return new Uint8Array(best!);
}

export function decodeBatch(bytes: Uint8Array): string[] {
  const codec = bytes[0];
  const body = Buffer.from(bytes.subarray(1));
  let text: Buffer;
  if (codec === Codec.Plain) text = body;
  else if (codec === Codec.DeflateDict1) text = inflateRawSync(body, { dictionary });
  else if (codec === Codec.Brotli) text = brotliDecompressSync(body);
  else throw new Error(`unknown codec ${codec}`);
  const s = text.toString('latin1');
  return s ? s.split('\n') : [];
}
