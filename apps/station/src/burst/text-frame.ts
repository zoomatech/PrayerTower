// Burst frames as one line of text, for sending through fldigi's own fast
// modes (BURST_MODE=fldigi): "PTB1 CALL <base64 of batch + CRC-32>".
// fldigi's mode adds its own error handling; the CRC catches what gets through.
import { crc32 } from 'node:zlib';

export function encodeTextFrame(batch: Uint8Array, callSign: string): string {
  const b = Buffer.alloc(batch.length + 4);
  b.set(batch);
  b.writeUInt32BE(crc32(batch) >>> 0, batch.length);
  return `PTB1 ${callSign.toUpperCase()} ${b.toString('base64')}`;
}

/** Every intact frame in received text (fldigi's receive pane or log). */
export function decodeTextFrames(text: string): { callSign: string; batch: Uint8Array }[] {
  const out: { callSign: string; batch: Uint8Array }[] = [];
  for (const m of text.matchAll(/PTB1 ([A-Z0-9/]{3,12}) ([A-Za-z0-9+/]+={0,2})/g)) {
    const b = Buffer.from(m[2]!, 'base64');
    if (b.length < 5) continue;
    const batch = b.subarray(0, b.length - 4);
    if ((crc32(batch) >>> 0) === b.readUInt32BE(b.length - 4)) out.push({ callSign: m[1]!, batch: new Uint8Array(batch) });
  }
  return out;
}
