// The prayer panel (docs/RADIO_BURST.md, "Prayer panel"): a batch of prayers packed into one
// black-and-white picture, in the spirit of dense information in a decodable panel. It can be
// shown on a screen, printed, or sent as an SSTV picture (sstv.ts), and decoded from a camera
// photo or from the SSTV picture. No Node APIs: the listener apps run this too.
//
//   grid: 80 x 60 cells (4 x 4 pixels each in a 320 x 240 SSTV picture)
//   ring 0: white quiet zone; rings 1-2: a solid black frame, whose outer corners a decoder
//   finds; inside: 74 x 54 data cells, one bit each (black = 1), row by row, high bit first.
//   bytes: the burst frame's Reed-Solomon header (preset id 240 = panel), then the
//   interleaved Reed-Solomon payload of the batch (frame.ts, 32 parity bytes a block),
//   all XORed with a fixed pseudo-random sequence so no area is plain black or white.
import { cmCompress, cmFit } from '../burst/cm.js';
import { DICTIONARY_V1 } from '../burst/dictionary.js';
import { decodeHeader, decodePayload, encodeHeader, encodePayload, HEADER_BYTES, HEADER_PARITY, payloadLength } from '../burst/frame.js';
import { PRIMER_V1 } from '../burst/primer.js';

export const GRID_W = 80;
export const GRID_H = 60;
/** The frame's outer edge, in cells from the picture's edge; data starts inside the frame. */
const FRAME_AT = 1;
const DATA_AT = 3;
export const DATA_W = GRID_W - 2 * DATA_AT;
export const DATA_H = GRID_H - 2 * DATA_AT;
export const PANEL_BYTES = Math.floor((DATA_W * DATA_H) / 8);
export const PANEL_PRESET_ID = 240;
export const PANEL_PARITY = 32;
const CODED_HEADER = HEADER_BYTES + HEADER_PARITY;

const latin1 = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0) & 0xff);
let primer: Uint8Array | null = null;
const cmPrimer = () => (primer ??= latin1(PRIMER_V1 + DICTIONARY_V1));

/** The largest batch that fits: header, then message (batch + CRC-32) in Reed-Solomon blocks. */
export function maxBatchBytes(): number {
  let m = PANEL_BYTES - CODED_HEADER;
  while (m > 4 && payloadLength(m, PANEL_PARITY) > PANEL_BYTES - CODED_HEADER) m--;
  return m - 4;
}

/** A fixed pseudo-random byte sequence (xorshift32) that whitens the panel. */
function whitening(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = 0x50414e4c; // "PANL"
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = s & 0xff;
  }
  return out;
}

/** Plain text (codec 0) or context mixing (codec 3), whichever is smaller: every listener app decodes both. */
function batchFor(prayers: readonly string[]): Uint8Array {
  const text = latin1(prayers.join('\n'));
  const cm = cmCompress(text, cmPrimer(), 'v1');
  const [codec, body] = cm.length < text.length ? [3, cm] : [0, text];
  const out = new Uint8Array(body.length + 1);
  out[0] = codec;
  out.set(body, 1);
  return out;
}

export interface Panel {
  /** GRID_W x GRID_H, row by row: 1 black, 0 white. */
  cells: Uint8Array;
  /** How many of the prayers given are on it (the first ones). */
  count: number;
}

/** Pack as many of the prayers (ASCII, as the station folds them) as fit into one panel. */
export function encodePanel(prayers: readonly string[], callSign: string): Panel {
  const room = maxBatchBytes();
  let count = Math.min(prayers.length, cmFit(prayers.map(latin1), cmPrimer(), 'v1', room - 1));
  let batch = batchFor(prayers.slice(0, count));
  // cmFit plans with codec 3; the plain codec never needs more room than that, but stay safe.
  while (batch.length > room && count > 0) batch = batchFor(prayers.slice(0, --count));
  const { payload, messageLength } = encodePayload(batch, PANEL_PARITY);
  const bytes = new Uint8Array(PANEL_BYTES);
  bytes.set(encodeHeader({ presetId: PANEL_PRESET_ID, messageLength, callSign }));
  bytes.set(payload, CODED_HEADER);
  const white = whitening(PANEL_BYTES);
  for (let i = 0; i < PANEL_BYTES; i++) bytes[i]! ^= white[i]!;
  const cells = new Uint8Array(GRID_W * GRID_H);
  for (let y = FRAME_AT; y < GRID_H - FRAME_AT; y++) {
    for (let x = FRAME_AT; x < GRID_W - FRAME_AT; x++) {
      const inside = x >= DATA_AT && x < GRID_W - DATA_AT && y >= DATA_AT && y < GRID_H - DATA_AT;
      if (!inside) cells[y * GRID_W + x] = 1;
    }
  }
  for (let i = 0; i < PANEL_BYTES * 8; i++) {
    const x = DATA_AT + (i % DATA_W);
    const y = DATA_AT + Math.floor(i / DATA_W);
    cells[y * GRID_W + x] = (bytes[i >> 3]! >> (7 - (i & 7))) & 1;
  }
  return { cells, count };
}

/** The panel as a grayscale picture, `scale` pixels a cell (4 for SSTV: 320 x 240). 0 black, 255 white. */
export function panelImage(cells: Uint8Array, scale = 4): { gray: Uint8Array; width: number; height: number } {
  const width = GRID_W * scale;
  const height = GRID_H * scale;
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) gray[y * width + x] = cells[Math.floor(y / scale) * GRID_W + Math.floor(x / scale)] ? 0 : 255;
  }
  return { gray, width, height };
}

export interface PanelFrame {
  callSign: string;
  /** The batch as it was sent: codec byte, then the prayers. */
  batch: Uint8Array;
  corrected: boolean;
}

/** Data cells (1 = black) back to the batch; null when it can't be read. */
export function decodeCells(cells: Uint8Array): PanelFrame | null {
  const bytes = new Uint8Array(PANEL_BYTES);
  for (let i = 0; i < PANEL_BYTES * 8; i++) {
    const x = DATA_AT + (i % DATA_W);
    const y = DATA_AT + Math.floor(i / DATA_W);
    if (cells[y * GRID_W + x]) bytes[i >> 3]! |= 1 << (7 - (i & 7));
  }
  const white = whitening(PANEL_BYTES);
  for (let i = 0; i < PANEL_BYTES; i++) bytes[i]! ^= white[i]!;
  const header = decodeHeader(bytes.subarray(0, CODED_HEADER));
  if (!header || header.presetId !== PANEL_PRESET_ID) return null;
  const length = payloadLength(header.messageLength, PANEL_PARITY);
  if (CODED_HEADER + length > PANEL_BYTES) return null;
  const out = decodePayload(bytes.slice(CODED_HEADER, CODED_HEADER + length), header.messageLength, PANEL_PARITY);
  return out ? { callSign: header.callSign, batch: out.batch, corrected: out.corrected } : null;
}

// Reading a picture -------------------------------------------------------------------------

/** Otsu's threshold for a grayscale picture. */
function otsu(gray: Uint8Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]!]!++;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = gray.length - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

type Point = [number, number];

/** The outer corners of the largest dark shape (the panel's frame): top-left, top-right, bottom-right, bottom-left. */
function frameCorners(gray: Uint8Array, width: number, height: number, threshold: number): Point[] | null {
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let best: { area: number; tl: Point; tr: Point; br: Point; bl: Point } | null = null;
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || gray[start]! > threshold) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let tl: Point = [0, 0], tr: Point = [0, 0], br: Point = [0, 0], bl: Point = [0, 0];
    let sTl = Infinity, sTr = -Infinity, sBr = -Infinity, sBl = -Infinity;
    while (top) {
      const p = stack[--top]!;
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x + y < sTl) (sTl = x + y), (tl = [x, y]);
      if (x - y > sTr) (sTr = x - y), (tr = [x + 1, y]);
      if (x + y > sBr) (sBr = x + y), (br = [x + 1, y + 1]);
      if (y - x > sBl) (sBl = y - x), (bl = [x, y + 1]);
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height || seen[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === width - 1)) continue;
        if (gray[q]! > threshold) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    const area = (maxX - minX + 1) * (maxY - minY + 1);
    if (!best || area > best.area) best = { area, tl, tr, br, bl };
  }
  if (!best || best.area < (width * height) / 50) return null;
  return [best.tl, best.tr, best.br, best.bl];
}

/** The homography taking the unit square's corners (0,0) (1,0) (1,1) (0,1) to these four points. */
function squareTo(q: Point[]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [Point, Point, Point, Point];
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0;
  const h = den ? (dx1 * sy - sx * dy1) / den : 0;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h];
}

function apply(m: number[], u: number, v: number): Point {
  const w = m[6]! * u + m[7]! * v + 1;
  return [(m[0]! * u + m[1]! * v + m[2]!) / w, (m[3]! * u + m[4]! * v + m[5]!) / w];
}

/** Each cell of the grid, read through the frame's corners in one of four orientations. */
function sampleCells(gray: Uint8Array, width: number, height: number, corners: Point[]): Float32Array {
  const m = squareTo(corners);
  const span = [GRID_W - 2 * FRAME_AT, GRID_H - 2 * FRAME_AT];
  const values = new Float32Array(GRID_W * GRID_H);
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      let sum = 0;
      let n = 0;
      // Five points around the cell's centre, a quarter cell apart.
      for (const [ox, oy] of [[0, 0], [-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as const) {
        const [px, py] = apply(m, (cx + 0.5 + ox - FRAME_AT) / span[0]!, (cy + 0.5 + oy - FRAME_AT) / span[1]!);
        const x = Math.floor(px), y = Math.floor(py);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        sum += gray[y * width + x]!;
        n++;
      }
      values[cy * GRID_W + cx] = n ? sum / n : 255;
    }
  }
  return values;
}

/**
 * Find and read a panel in a grayscale picture: an SSTV picture, a screenshot, or a camera
 * photo with the whole panel in view (reasonably square on, any of four orientations).
 */
export function decodePanelImage(gray: Uint8Array, width: number, height: number): PanelFrame | null {
  const threshold = otsu(gray);
  const corners = frameCorners(gray, width, height, threshold);
  if (!corners) return null;
  for (let turn = 0; turn < 4; turn++) {
    const order = [0, 1, 2, 3].map((i) => corners[(i + turn) % 4]!);
    const values = sampleCells(gray, width, height, order);
    // The cells' own threshold: data is whitened, so about half are black.
    const t = otsu(Uint8Array.from(values, (v) => Math.round(v)));
    const cells = Uint8Array.from(values, (v) => (v <= t ? 1 : 0));
    const frame = decodeCells(cells);
    if (frame) return frame;
  }
  return null;
}
