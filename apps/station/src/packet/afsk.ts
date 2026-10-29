// APRS packet fallback (docs/RADIO_BURST.md, "Packet fallback"): for a station
// whose radio or hookup can't carry the OFDM bursts, the prayers' short IDs and a
// count go out as standard 1200-baud packet (Bell 202 AFSK, AX.25 UI frames), the
// mode every APRS radio and TNC already decodes. No Node APIs: the listening
// page bundles this too.
//
// Bell 202 and HDLC, from N1VG's "1200 Baud Packet Radio Details": mark 1200 Hz,
// space 2200 Hz, continuous phase; NRZI (a 0 is a change of tone, a 1 is none);
// bytes least significant bit first; flag 0x7E, never stuffed; a 0 after every
// five 1s elsewhere; FCS is CRC-16-CCITT (init 0xFFFF, reflected polynomial
// 0x8408, complemented), sent low byte first. AX.25 fields from Linux's ax25.h:
// UI control 0x03, PID 0xF0 (no layer 3), SSID spare bits 0x60, C bit 0x80,
// extension bit 0x01 on the last address byte.
import { finiteSamples } from '../burst/samples.js';

export const BAUD = 1200;
export const MARK_HZ = 1200;
export const SPACE_HZ = 2200;
export const FLAG = 0x7e;

export interface Ax25Frame {
  dest: string;
  src: string;
  /** Digipeater path, e.g. ["WIDE1-1"]; empty by default (no digipeating). */
  path?: string[];
  info: string;
}

function parseCall(call: string): { call: string; ssid: number } {
  const m = /^([A-Z0-9]{1,6})(?:-(\d{1,2}))?$/.exec(call.toUpperCase());
  const ssid = m?.[2] ? Number(m[2]) : 0;
  if (!m || ssid > 15) throw new Error(`"${call}" is not an AX.25 address (up to 6 letters and digits, SSID 0-15)`);
  return { call: m[1]!, ssid };
}

function address(call: string, last: boolean, cbit: boolean): number[] {
  const a = parseCall(call);
  const out = Array.from(a.call.padEnd(6, ' '), (ch) => ch.charCodeAt(0) << 1);
  out.push((cbit ? 0x80 : 0) | 0x60 | (a.ssid << 1) | (last ? 1 : 0));
  return out;
}

export function fcs(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
  }
  return ~crc & 0xffff;
}

/** A UI frame (a command: destination C bit set), with its FCS. */
export function encodeFrame(f: Ax25Frame): Uint8Array {
  const path = f.path ?? [];
  const head = [...address(f.dest, false, true), ...address(f.src, path.length === 0, false), ...path.flatMap((p, i) => address(p, i === path.length - 1, false))];
  const body = Uint8Array.from([...head, 0x03, 0xf0, ...Array.from(f.info, (ch) => ch.charCodeAt(0) & 0xff)]);
  const crc = fcs(body);
  return Uint8Array.from([...body, crc & 0xff, crc >>> 8]);
}

export function decodeFrame(bytes: Uint8Array): Ax25Frame | null {
  if (bytes.length < 18) return null;
  const crc = bytes[bytes.length - 2]! | (bytes[bytes.length - 1]! << 8);
  if (fcs(bytes.subarray(0, bytes.length - 2)) !== crc) return null;
  const calls: string[] = [];
  let i = 0;
  for (;;) {
    if (i + 7 > bytes.length - 2) return null;
    const call = String.fromCharCode(...Array.from(bytes.subarray(i, i + 6), (b) => b >> 1)).trim();
    const ssid = (bytes[i + 6]! >> 1) & 0x0f;
    calls.push(ssid ? `${call}-${ssid}` : call);
    const last = bytes[i + 6]! & 1;
    i += 7;
    if (last) break;
  }
  if (calls.length < 2 || bytes[i] !== 0x03 || bytes[i + 1] !== 0xf0) return null;
  const info = String.fromCharCode(...bytes.subarray(i + 2, bytes.length - 2));
  return { dest: calls[0]!, src: calls[1]!, path: calls.slice(2), info };
}

/** HDLC bits for one or more frames: flags, stuffed frames LSB first, flags between and after. */
export function hdlcBits(frames: Uint8Array[], leadFlags: number, tailFlags = 3): number[] {
  const bits: number[] = [];
  const flag = () => {
    for (let i = 0; i < 8; i++) bits.push((FLAG >> i) & 1);
  };
  for (let i = 0; i < leadFlags; i++) flag();
  for (const frame of frames) {
    let ones = 0;
    for (const byte of frame) {
      for (let i = 0; i < 8; i++) {
        const b = (byte >> i) & 1;
        bits.push(b);
        ones = b ? ones + 1 : 0;
        if (ones === 5) {
          bits.push(0);
          ones = 0;
        }
      }
    }
    for (let i = 0; i < tailFlags; i++) flag();
  }
  return bits;
}

/**
 * The AFSK audio: NRZI over the bits, continuous-phase tones, at `rate`.
 * `leadSeconds` of flags first gives the receiving radio's squelch and the
 * decoder time to settle (TXDELAY).
 */
export function modulate(frames: Uint8Array[], rate = 48_000, opts: { leadSeconds?: number; amplitude?: number } = {}): Float32Array {
  const lead = Math.max(1, Math.ceil(((opts.leadSeconds ?? 0.3) * BAUD) / 8));
  const bits = hdlcBits(frames, lead);
  const amp = opts.amplitude ?? 0.5;
  const out = new Float32Array(Math.ceil((bits.length * rate) / BAUD));
  let tone = MARK_HZ;
  let phase = 0;
  let n = 0;
  for (let k = 0; k < bits.length; k++) {
    if (bits[k] === 0) tone = tone === MARK_HZ ? SPACE_HZ : MARK_HZ;
    const end = Math.round(((k + 1) * rate) / BAUD);
    for (; n < end; n++) {
      out[n] = amp * Math.sin(phase);
      phase += (2 * Math.PI * tone) / rate;
      if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    }
  }
  return out;
}

/**
 * Decode every good frame in the audio. A quadrature correlator over one bit
 * says mark or space at each sample; a clock follows the tone changes and
 * samples mid-bit; NRZI, HDLC unstuffing and the FCS do the rest. Frames that
 * fail the FCS are dropped, so noise never yields a wrong frame. Each frame is
 * returned with the sample where it ended.
 */
export function demodulate(input: Float32Array, rate = 48_000): { frame: Ax25Frame; end: number }[] {
  const audio = finiteSamples(input);
  const spb = rate / BAUD;
  const w = Math.round(spb);
  // Sliding correlations with mark and space (cos and sin), one bit long.
  const tones = [MARK_HZ, SPACE_HZ].map((f) => {
    const step = (2 * Math.PI * f) / rate;
    const c = new Float64Array(audio.length + 1);
    const s = new Float64Array(audio.length + 1);
    for (let i = 0; i < audio.length; i++) {
      c[i + 1] = c[i]! + audio[i]! * Math.cos(step * i);
      s[i + 1] = s[i]! + audio[i]! * Math.sin(step * i);
    }
    return { c, s };
  });
  const level = (t: { c: Float64Array; s: Float64Array }, i: number) => {
    const a = Math.max(0, i - w);
    const dc = t.c[i]! - t.c[a]!;
    const ds = t.s[i]! - t.s[a]!;
    return dc * dc + ds * ds;
  };
  // d > 0: mark. Centered on the bit: the window ends half a bit later.
  const d = new Float32Array(audio.length);
  for (let i = 0; i < audio.length; i++) {
    const j = Math.min(audio.length, i + (w >> 1));
    d[i] = level(tones[0]!, j) - level(tones[1]!, j);
  }
  const out: { frame: Ax25Frame; end: number }[] = [];
  // Clock: next sample point, nudged toward the middle between tone changes.
  let next = spb / 2;
  let prevSign = d[0]! > 0;
  let lastTone = prevSign;
  let ones = 0;
  let inFrame = false;
  let byte = 0;
  let nbits = 0;
  let bytes: number[] = [];
  const endFrame = (at: number) => {
    if (inFrame && nbits === 7 && bytes.length >= 18) {
      const f = decodeFrame(Uint8Array.from(bytes));
      if (f) out.push({ frame: f, end: at });
    }
  };
  for (let i = 1; i < audio.length; i++) {
    const sign = d[i]! > 0;
    if (sign !== prevSign) {
      // A tone change should fall half a bit from a sample point.
      const err = next - i - spb / 2;
      next -= err * 0.25;
      prevSign = sign;
    }
    if (i < next) continue;
    next += spb;
    const bit = sign === lastTone ? 1 : 0;
    lastTone = sign;
    if (bit) {
      ones++;
      if (ones > 6) {
        // Seven 1s: not a frame (idle or noise).
        inFrame = false;
        continue;
      }
    } else {
      if (ones === 6) {
        // A flag: end any frame, start the next.
        endFrame(i);
        inFrame = true;
        bytes = [];
        byte = 0;
        nbits = 0;
        ones = 0;
        continue;
      }
      if (ones === 5) {
        // A stuffed 0.
        ones = 0;
        continue;
      }
      ones = 0;
    }
    if (!inFrame) continue;
    byte |= bit << nbits;
    if (++nbits === 8) {
      bytes.push(byte);
      byte = 0;
      nbits = 0;
      if (bytes.length > 400) inFrame = false;
    }
  }
  return out;
}
