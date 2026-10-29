// Codec 3: a small context-mixing compressor, written here in the style of
// Matt Mahoney's lpaq family, primed with published text so even one short
// prayer compresses well. Integer-only arithmetic, so every platform
// produces and reads exactly the same bits. The algorithm is the format;
// docs/RADIO_BURST.md describes it and this file is the reference.
//
// Each byte is coded one bit at a time, most significant first. Seven models
// predict the bit from different contexts (orders 0-4 and 6, and the current
// word with the previous one). A mixer weighs their predictions by how well
// each has done in this kind of spot, and a binary arithmetic coder turns the
// mixed probability into output bits.

// squash(x) = 4096 / (1 + e^-x/256), by interpolating 33 points of the curve.
const SQ_T = [1, 2, 3, 6, 10, 16, 27, 45, 73, 120, 194, 310, 488, 747, 1101, 1546, 2047, 2549, 2994, 3348, 3607, 3785, 3901, 3975, 4022, 4050, 4068, 4079, 4085, 4089, 4092, 4093, 4094];
function squash(d: number): number {
  if (d > 2047) return 4095;
  if (d < -2047) return 1;
  const w = d & 127;
  const i = (d >> 7) + 16;
  return (SQ_T[i]! * (128 - w) + SQ_T[i + 1]! * w + 64) >> 7;
}
const STRETCH = new Int16Array(4096);
{
  let pi = 0;
  for (let x = -2047; x <= 2047; x++) {
    const v = squash(x);
    for (let i = pi; i <= v; i++) STRETCH[i] = x;
    pi = v + 1;
  }
  for (let i = pi; i < 4096; i++) STRETCH[i] = 2047;
}

const BITS = 18; // slots per model table
const MASK = (1 << BITS) - 1;
const INPUTS = 8; // version 1: 7 models + a bias input
const INPUTS_V2 = 10; // version 2: 2 more models (the current word alone, and bytes 2-3 back)
/** Model versions: the format of codec 3 (v1) and codec 4 (v2). */
export type CmVersion = 1 | 2;
const inputsFor = (v: CmVersion) => (v === 2 ? INPUTS_V2 : INPUTS);
const LIMIT = 60; // most a slot's count grows: higher learns slower but steadier

/** Learning step for a slot seen n times: 65536 / (n + 1.5). */
const DT = Int32Array.from({ length: LIMIT + 1 }, (_, n) => Math.floor(131072 / (2 * n + 3)));

const mix32 = (a: number, b: number) => (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + Math.imul(b, 0x297a2d39) + (b >>> 16)) >>> 0;

interface State {
  v: CmVersion;
  p: Uint16Array[]; // probability of a 1, 16 bits, per slot
  n: Uint8Array[]; // times seen, per slot
  w: Int32Array; // mixer weights, 16.16 fixed point, per weight set
  /** Version 2: the APM (secondary estimation) table, 33 points per order-1 context and partial byte. */
  apm: Uint16Array;
}

function newState(v: CmVersion): State {
  const inputs = inputsFor(v);
  const apm = new Uint16Array(v === 2 ? 256 * 256 * 33 : 0);
  // Each row starts as the identity: squash of the bucket's stretch value.
  for (let r = 0; r < apm.length; r += 33) for (let j = 0; j < 33; j++) apm[r + j] = squash((j - 16) * 128) * 16;
  return {
    v,
    p: Array.from({ length: inputs - 1 }, () => new Uint16Array(1 << BITS).fill(32768)),
    n: Array.from({ length: inputs - 1 }, () => new Uint8Array(1 << BITS)),
    w: new Int32Array(256 * (v === 2 ? 3 : 1) * inputs).fill(Math.floor(65536 / 4)),
    apm,
  };
}
const copyState = (s: State): State => ({ v: s.v, p: s.p.map((a) => a.slice()), n: s.n.map((a) => a.slice()), w: s.w.slice(), apm: s.apm.slice() });

/** The predictor: call p() for the next bit's chance of being 1 (1..4095), then update(bit). */
class Model {
  private c0 = 1; // the bits of this byte so far, after a leading 1
  private hist = [0, 0, 0, 0, 0, 0]; // last bytes, newest first
  private word = 0;
  private prevWord = 0;
  private readonly inputs: number;
  private ctx: Uint32Array; // per-model context hash for this byte
  private idx: Int32Array;
  private st: Int32Array;
  private pr = 2048; // the mixer's prediction
  private out = 2048; // after the APM (version 2)
  private apmIdx = 0;
  private apmW = 0;

  constructor(private s: State) {
    this.inputs = inputsFor(s.v);
    this.ctx = new Uint32Array(this.inputs - 1);
    this.idx = new Int32Array(this.inputs - 1);
    this.st = new Int32Array(this.inputs);
    this.byteContexts();
  }

  private byteContexts() {
    const h = this.hist;
    this.ctx[0] = 0;
    this.ctx[1] = mix32(1, h[0]!);
    this.ctx[2] = mix32(2, h[0]! | (h[1]! << 8));
    this.ctx[3] = mix32(3, h[0]! | (h[1]! << 8) | (h[2]! << 16));
    this.ctx[4] = mix32(4, (h[0]! | (h[1]! << 8) | (h[2]! << 16) | (h[3]! << 24)) >>> 0);
    this.ctx[5] = mix32(mix32(6, (h[0]! | (h[1]! << 8) | (h[2]! << 16) | (h[3]! << 24)) >>> 0), h[4]! | (h[5]! << 8));
    this.ctx[6] = mix32(mix32(7, this.word), this.prevWord);
    if (this.s.v === 2) {
      this.ctx[7] = mix32(8, this.word);
      this.ctx[8] = mix32(9, h[1]! | (h[2]! << 8));
    }
  }

  /** Which set of mixer weights: by the bits of this byte so far, and in version 2 also by what the last byte was (letter, space, other). */
  private mixerSet(): number {
    if (this.s.v === 1) return this.c0;
    const h = this.hist[0]! | 32;
    return this.c0 + 256 * (h >= 97 && h <= 122 ? 0 : this.hist[0] === 32 ? 1 : 2);
  }

  p(): number {
    const st = this.st;
    const inputs = this.inputs;
    for (let i = 0; i < inputs - 1; i++) {
      const j = (mix32(this.ctx[i]!, this.c0) & MASK) >>> 0;
      this.idx[i] = j;
      st[i] = STRETCH[this.s.p[i]![j]! >> 4]!;
    }
    st[inputs - 1] = 256;
    const w = this.s.w;
    const base = this.mixerSet() * inputs;
    let dot = 0;
    for (let i = 0; i < inputs; i++) dot += (st[i]! * w[base + i]!) >> 8;
    this.pr = squash(dot >> 8);
    if (this.s.v === 1) return this.pr;
    // APM: refine the mixer's guess for this order-1 context, interpolating between two of 33 buckets.
    const x = STRETCH[this.pr]! + 2048;
    const lo = x >> 7;
    this.apmW = x & 127;
    this.apmIdx = (this.hist[0]! * 256 + this.c0) * 33 + lo;
    const a = this.s.apm;
    const refined = (a[this.apmIdx]! * (128 - this.apmW) + a[this.apmIdx + 1]! * this.apmW) >> 11;
    this.out = Math.max(1, Math.min(4095, (this.pr + 3 * refined + 2) >> 2));
    return this.out;
  }

  update(bit: number) {
    // Mixer: nudge each weight toward the inputs that pointed the right way.
    const err = ((bit << 12) - this.pr) * 6;
    const w = this.s.w;
    const inputs = this.inputs;
    const base = this.mixerSet() * inputs;
    for (let i = 0; i < inputs; i++) w[base + i]! += (this.st[i]! * err) >> 10;
    if (this.s.v === 2) {
      // APM: move the two buckets it read toward the bit, each by its share.
      const a = this.s.apm;
      const g = bit ? 65535 : 0;
      const i0 = this.apmIdx;
      a[i0] = a[i0]! + (((g - a[i0]!) * (128 - this.apmW)) >> 13);
      a[i0 + 1] = a[i0 + 1]! + (((g - a[i0 + 1]!) * this.apmW) >> 13);
    }
    // Models: move each slot's probability toward the bit, faster while it is new.
    const target = bit ? 65535 : 0;
    for (let i = 0; i < inputs - 1; i++) {
      const j = this.idx[i]!;
      const p = this.s.p[i]!;
      const n = this.s.n[i]!;
      const c = n[j]!;
      p[j] = p[j]! + (((target - p[j]!) * DT[c]!) >> 16);
      if (c < LIMIT) n[j] = c + 1;
    }
    this.c0 = (this.c0 << 1) | bit;
    if (this.c0 >= 256) {
      const byte = this.c0 & 255;
      this.c0 = 1;
      this.hist.pop();
      this.hist.unshift(byte);
      const lower = byte >= 65 && byte <= 90 ? byte + 32 : byte;
      if (lower >= 97 && lower <= 122) this.word = mix32(this.word + 1, lower);
      else if (this.word) {
        this.prevWord = this.word;
        this.word = 0;
      }
      this.byteContexts();
    }
  }
}

class Encoder {
  private x1 = 0;
  private x2 = 0xffffffff;
  readonly out: number[] = [];
  bit(bit: number, p: number) {
    const range = this.x2 - this.x1;
    const xmid = this.x1 + Math.floor(range / 4096) * p + Math.floor(((range % 4096) * p) / 4096);
    if (bit) this.x2 = xmid;
    else this.x1 = xmid + 1;
    while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
      this.out.push(this.x2 >>> 24);
      this.x1 = (this.x1 << 8) >>> 0;
      this.x2 = ((this.x2 << 8) | 255) >>> 0;
    }
  }
  flush() {
    this.out.push(this.x1 >>> 24);
  }
}

class Decoder {
  private x1 = 0;
  private x2 = 0xffffffff;
  private x = 0;
  private at = 0;
  constructor(private data: Uint8Array) {
    for (let i = 0; i < 4; i++) this.x = ((this.x << 8) | this.next()) >>> 0;
  }
  private next() {
    return this.at < this.data.length ? this.data[this.at++]! : 255;
  }
  bit(p: number): number {
    const range = this.x2 - this.x1;
    const xmid = this.x1 + Math.floor(range / 4096) * p + Math.floor(((range % 4096) * p) / 4096);
    const bit = this.x <= xmid ? 1 : 0;
    if (bit) this.x2 = xmid;
    else this.x1 = xmid + 1;
    while (((this.x1 ^ this.x2) & 0xff000000) === 0) {
      this.x1 = (this.x1 << 8) >>> 0;
      this.x2 = ((this.x2 << 8) | 255) >>> 0;
      this.x = ((this.x << 8) | this.next()) >>> 0;
    }
    return bit;
  }
}

const primed = new Map<string, State>();
function primedState(primer: Uint8Array, key: string, v: CmVersion): State {
  let s = primed.get(`${v}:${key}`);
  if (!s) {
    s = newState(v);
    const m = new Model(s);
    for (const byte of primer) {
      for (let i = 7; i >= 0; i--) {
        m.p();
        m.update((byte >> i) & 1);
      }
    }
    primed.set(`${v}:${key}`, s);
  }
  return s;
}

/** The most text a batch may unpack to (see cmDecompress). */
export const MAX_TEXT = 4 * 1024 * 1024;

/** Varint length, then the arithmetic-coded bytes. */
export function cmCompress(text: Uint8Array, primer: Uint8Array, key: string, v: CmVersion = 1): Uint8Array {
  const m = new Model(copyState(primedState(primer, key, v)));
  const enc = new Encoder();
  for (const byte of text) {
    for (let i = 7; i >= 0; i--) {
      const bit = (byte >> i) & 1;
      enc.bit(bit, m.p());
      m.update(bit);
    }
  }
  enc.flush();
  const len: number[] = [];
  let n = text.length;
  do {
    len.push((n & 127) | (n > 127 ? 128 : 0));
    n >>>= 7;
  } while (n);
  return Uint8Array.from([...len, ...enc.out]);
}

/**
 * How many of `pieces`, joined with newlines, fit in maxBytes once compressed
 * (an upper bound on cmCompress's size). Stops reading as soon as they don't,
 * so sizing a frame costs one pass over the prayers that go in it.
 */
export function cmFit(pieces: readonly Uint8Array[], primer: Uint8Array, key: string, maxBytes: number, v: CmVersion = 1): number {
  const m = new Model(copyState(primedState(primer, key, v)));
  const enc = new Encoder();
  let total = 0;
  for (let k = 0; k < pieces.length; k++) {
    const piece = k ? [10, ...pieces[k]!] : pieces[k]!;
    total += piece.length;
    for (const byte of piece) {
      for (let i = 7; i >= 0; i--) {
        const bit = (byte >> i) & 1;
        enc.bit(bit, m.p());
        m.update(bit);
      }
    }
    // Bytes out so far, the flush byte, room for unsettled coder state, and the length varint.
    if (enc.out.length + 5 + Math.ceil(Math.log2(total + 2) / 7) > maxBytes) return k;
  }
  return pieces.length;
}

export function cmDecompress(data: Uint8Array, primer: Uint8Array, key: string, v: CmVersion = 1): Uint8Array {
  let length = 0;
  let at = 0;
  for (let shift = 0; ; shift += 7) {
    const b = data[at++];
    if (b === undefined || shift > 28) throw new Error('bad length');
    length |= (b & 127) << shift;
    if (!(b & 128)) break;
  }
  // The longest real batch is 1,000 copies of a 2,800-character prayer (2.8 MB);
  // a bigger claimed length is damage or mischief, and would tie a receiver up for seconds.
  if (length > MAX_TEXT) throw new Error('bad length');
  const m = new Model(copyState(primedState(primer, key, v)));
  const dec = new Decoder(data.subarray(at));
  const out = new Uint8Array(length);
  for (let k = 0; k < length; k++) {
    let byte = 0;
    for (let i = 0; i < 8; i++) {
      const bit = dec.bit(m.p());
      m.update(bit);
      byte = (byte << 1) | bit;
    }
    out[k] = byte;
  }
  return out;
}
