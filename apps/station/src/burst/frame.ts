// The byte layer of a burst frame (docs/RADIO_BURST.md, "Frame bytes").
//
//   header (16 bytes, then 16 Reed-Solomon parity bytes):
//     'P' 'T'  version=1  preset id  message length (3 bytes, big-endian)
//     call sign (8 ASCII bytes, space padded)  flags=0
//   message: batch bytes (codec byte + compressed prayers), then CRC-32 of them
//   payload: the message cut into equal Reed-Solomon blocks, interleaved byte by byte
import { crc32 } from 'node:zlib';
import { rsDecode, rsEncode } from './rs.js';

export const HEADER_BYTES = 16;
export const HEADER_PARITY = 16;
export const FRAME_VERSION = 1;

export interface FrameHeader {
  presetId: number;
  messageLength: number;
  callSign: string;
}

export function encodeHeader(h: FrameHeader): Uint8Array {
  const b = new Uint8Array(HEADER_BYTES);
  b[0] = 0x50; // P
  b[1] = 0x54; // T
  b[2] = FRAME_VERSION;
  b[3] = h.presetId;
  b[4] = (h.messageLength >> 16) & 0xff;
  b[5] = (h.messageLength >> 8) & 0xff;
  b[6] = h.messageLength & 0xff;
  const call = h.callSign.toUpperCase().slice(0, 8).padEnd(8, ' ');
  for (let i = 0; i < 8; i++) b[7 + i] = call.charCodeAt(i) & 0x7f;
  b[15] = 0;
  return rsEncode(b, HEADER_PARITY);
}

export function decodeHeader(coded: Uint8Array): FrameHeader | null {
  const b = rsDecode(coded, HEADER_PARITY);
  if (!b || b[0] !== 0x50 || b[1] !== 0x54 || b[2] !== FRAME_VERSION) return null;
  return {
    presetId: b[3]!,
    messageLength: (b[4]! << 16) | (b[5]! << 8) | b[6]!,
    callSign: String.fromCharCode(...b.subarray(7, 15)).trim(),
  };
}

/** How the message is cut into Reed-Solomon blocks: equal sizes, each at most 255 - parity data bytes. */
export function blockSizes(messageLength: number, parity: number): number[] {
  const perBlock = 255 - parity;
  const count = Math.max(1, Math.ceil(messageLength / perBlock));
  const small = Math.floor(messageLength / count);
  return Array.from({ length: count }, (_, i) => small + (i < messageLength % count ? 1 : 0));
}

export const payloadLength = (messageLength: number, parity: number) =>
  blockSizes(messageLength, parity).reduce((n, k) => n + k + parity, 0);

/** batch bytes -> message (with CRC-32) -> interleaved Reed-Solomon payload. */
export function encodePayload(batch: Uint8Array, parity: number): { payload: Uint8Array; messageLength: number } {
  const message = new Uint8Array(batch.length + 4);
  message.set(batch);
  new DataView(message.buffer).setUint32(batch.length, crc32(batch) >>> 0);
  const blocks: Uint8Array[] = [];
  let at = 0;
  for (const k of blockSizes(message.length, parity)) {
    blocks.push(rsEncode(message.subarray(at, at + k), parity));
    at += k;
  }
  return { payload: interleave(blocks), messageLength: message.length };
}

/** The inverse of encodePayload; null when a block is beyond repair or the CRC fails. */
export function decodePayload(payload: Uint8Array, messageLength: number, parity: number): { batch: Uint8Array; corrected: boolean } | null {
  const sizes = blockSizes(messageLength, parity).map((k) => k + parity);
  const blocks = deinterleave(payload, sizes);
  const message = new Uint8Array(messageLength);
  let at = 0;
  let corrected = false;
  for (const block of blocks) {
    const data = rsDecode(block, parity);
    if (!data) return null;
    if (!corrected && !rsEncode(data, parity).every((v, i) => v === block[i])) corrected = true;
    message.set(data, at);
    at += data.length;
  }
  const batch = message.subarray(0, messageLength - 4);
  const crc = new DataView(message.buffer).getUint32(messageLength - 4);
  if ((crc32(batch) >>> 0) !== crc) return null;
  return { batch, corrected };
}

/** Byte i of every block, then byte i+1 of every block, ... so a fade spreads over all blocks. */
function interleave(blocks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  const longest = Math.max(...blocks.map((b) => b.length));
  let o = 0;
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out[o++] = b[i]!;
  return out;
}

function deinterleave(data: Uint8Array, sizes: number[]): Uint8Array[] {
  const blocks = sizes.map((n) => new Uint8Array(n));
  const longest = Math.max(...sizes);
  let o = 0;
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) b[i] = data[o++] ?? 0;
  return blocks;
}
