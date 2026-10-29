// What the packet fallback sends (docs/RADIO_BURST.md, "Packet fallback"): APRS
// status reports (data type ">", APRS 1.0.1 chapter 5) to the experimental
// destination APZPTW (APZxxx is reserved for experimental software, chapter 4).
// Each one carries the batch's prayer count and up to six short IDs: the first
// six hex digits of each prayer's fingerprint, which the server already holds as
// sent_hash. The words never go out in this mode.
//   >PT 12 prayers 1/2: 3fa9c1 07b2de 9c44e0 a1b2c3 d4e5f6 0a0b0c
import type { Ax25Frame } from './afsk.js';

export const DEST = 'APZPTW';
export const IDS_PER_PACKET = 6;
export const ID_HEX = 6;
export const PACKET_PRESET = 'aprs-1200';

export const shortId = (fingerprint: string) => fingerprint.slice(0, ID_HEX);

/** One status frame per six IDs; every frame repeats the batch's total. */
export function statusFrames(callSign: string, ids: string[], path: string[] = []): Ax25Frame[] {
  const pages = Math.max(1, Math.ceil(ids.length / IDS_PER_PACKET));
  return Array.from({ length: pages }, (_, p) => ({
    dest: DEST,
    src: callSign,
    path,
    info: `>PT ${ids.length} prayers ${p + 1}/${pages}: ${ids.slice(p * IDS_PER_PACKET, (p + 1) * IDS_PER_PACKET).join(' ')}`.trimEnd(),
  }));
}

export interface PacketStatus {
  callSign: string;
  count: number;
  page: number;
  pages: number;
  ids: string[];
}

const STATUS = /^>PT (\d{1,4}) prayers (\d{1,3})\/(\d{1,3}):((?: [0-9a-f]{6}){0,6})$/;

/** A Prayer Tower status frame, or null for any other packet. */
export function parseStatus(f: Ax25Frame): PacketStatus | null {
  if (f.dest.replace(/-\d+$/, '') !== DEST) return null;
  const m = STATUS.exec(f.info);
  if (!m) return null;
  return { callSign: f.src, count: Number(m[1]), page: Number(m[2]), pages: Number(m[3]), ids: m[4]!.trim().split(' ').filter(Boolean) };
}
