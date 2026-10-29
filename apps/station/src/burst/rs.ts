// Reed-Solomon over GF(2^8), primitive polynomial 0x11d, first consecutive
// root alpha^0 (the common "RS(255,223)" family used by CCSDS-style links and
// QR codes). Corrects up to nsym/2 wrong bytes per block of at most 255 bytes.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);
const div = (a: number, b: number) => {
  if (b === 0) throw new Error('divide by zero');
  return a === 0 ? 0 : EXP[(LOG[a]! + 255 - LOG[b]!) % 255]!;
};
const pow = (a: number, p: number) => EXP[(((LOG[a]! * p) % 255) + 255) % 255]!;
const inv = (a: number) => EXP[255 - LOG[a]!]!;

// Polynomials are arrays with the highest power first.
function polyMul(p: number[], q: number[]): number[] {
  const r = new Array<number>(p.length + q.length - 1).fill(0);
  for (let j = 0; j < q.length; j++) for (let i = 0; i < p.length; i++) r[i + j]! ^= mul(p[i]!, q[j]!);
  return r;
}
function polyEval(p: number[], x: number): number {
  let y = p[0]!;
  for (let i = 1; i < p.length; i++) y = mul(y, x) ^ p[i]!;
  return y;
}
function polyScale(p: number[], s: number) {
  return p.map((c) => mul(c, s));
}
function polyAdd(p: number[], q: number[]) {
  const r = new Array<number>(Math.max(p.length, q.length)).fill(0);
  for (let i = 0; i < p.length; i++) r[i + r.length - p.length] = p[i]!;
  for (let i = 0; i < q.length; i++) r[i + r.length - q.length]! ^= q[i]!;
  return r;
}

const generators = new Map<number, number[]>();
function generator(nsym: number): number[] {
  let g = generators.get(nsym);
  if (!g) {
    g = [1];
    for (let i = 0; i < nsym; i++) g = polyMul(g, [1, pow(2, i)]);
    generators.set(nsym, g);
  }
  return g;
}

/** data followed by nsym parity bytes. data.length + nsym must be at most 255. */
export function rsEncode(data: Uint8Array, nsym: number): Uint8Array {
  if (data.length + nsym > 255) throw new Error('Reed-Solomon block longer than 255 bytes');
  const gen = generator(nsym);
  const out = new Uint8Array(data.length + nsym);
  out.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = out[i]!;
    if (coef !== 0) for (let j = 1; j < gen.length; j++) out[i + j]! ^= mul(gen[j]!, coef);
  }
  out.set(data);
  return out;
}

/** Corrects errors in place-copy and returns the data bytes, or null when the block has too many errors. */
export function rsDecode(block: Uint8Array, nsym: number): Uint8Array | null {
  const msg = Array.from(block);
  const synd = Array.from({ length: nsym }, (_, i) => polyEval(msg, pow(2, i)));
  if (synd.every((s) => s === 0)) return Uint8Array.from(msg.slice(0, msg.length - nsym));

  // Berlekamp-Massey: the error locator polynomial.
  let errLoc = [1];
  let oldLoc = [1];
  for (let i = 0; i < nsym; i++) {
    let delta = synd[i]!;
    for (let j = 1; j < errLoc.length; j++) delta ^= mul(errLoc[errLoc.length - 1 - j]!, synd[i - j]!);
    oldLoc = [...oldLoc, 0];
    if (delta !== 0) {
      if (oldLoc.length > errLoc.length) {
        const newLoc = polyScale(oldLoc, delta);
        oldLoc = polyScale(errLoc, inv(delta));
        errLoc = newLoc;
      }
      errLoc = polyAdd(errLoc, polyScale(oldLoc, delta));
    }
  }
  while (errLoc.length && errLoc[0] === 0) errLoc.shift();
  const errs = errLoc.length - 1;
  if (errs * 2 > nsym) return null;

  // Chien search: positions where the locator has a root.
  const n = msg.length;
  const pos: number[] = [];
  for (let i = 0; i < n; i++) if (polyEval(errLoc, pow(2, 255 - i)) === 0) pos.push(n - 1 - i);
  if (pos.length !== errs) return null;

  // Forney: error magnitudes.
  const coefPos = pos.map((p) => n - 1 - p);
  let eLoc = [1];
  for (const c of coefPos) eLoc = polyMul(eLoc, polyAdd([1], [pow(2, c), 0]));
  const syndRev = [...synd].reverse().concat(0); // the syndrome polynomial times x, so that alpha^0 is the first root
  let omega = polyMul(syndRev, eLoc);
  omega = omega.slice(omega.length - eLoc.length);
  const X = coefPos.map((c) => pow(2, c));
  for (let i = 0; i < X.length; i++) {
    const xiInv = inv(X[i]!);
    let denom = 1;
    for (let j = 0; j < X.length; j++) if (j !== i) denom = mul(denom, 1 ^ mul(xiInv, X[j]!));
    const y = mul(polyEval(omega, xiInv), X[i]!);
    if (denom === 0) return null;
    msg[pos[i]!]! ^= div(y, denom);
  }
  if (Array.from({ length: nsym }, (_, i) => polyEval(msg, pow(2, i))).some((s) => s !== 0)) return null;
  return Uint8Array.from(msg.slice(0, n - nsym));
}
