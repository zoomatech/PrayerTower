// Where a sky target is from the station, for aiming a dish (sky.ts). Low
// precision on purpose: a consumer 60 cm dish at 10 GHz has a beam about 3.5°
// wide, and these formulas are good to a few arcminutes.
//   Sidereal time: USNO, "Computing Greenwich Apparent Sidereal Time"
//     (https://aa.usno.navy.mil/faq/GAST), GMST = 6.697375 + 0.065709824279 D
//     + 1.0027379 H hours.
//   Moon: Paul Schlyter, "How to compute planetary positions"
//     (https://stjarnhimlen.se/comp/ppcomp.html): mean elements, the main
//     perturbations, and the topocentric parallax correction.
//   Alpha Centauri A: J2000 RA 14h 39m 36.494s, Dec −60° 50′ 02.37″
//     (https://en.wikipedia.org/wiki/Alpha_Centauri). Precession since 2000
//     (about 0.3°) is left out; it is well inside the beam.

export type SkyTarget = 'zenith' | 'moon' | 'alpha_centauri' | 'custom';
export const SKY_TARGETS: SkyTarget[] = ['zenith', 'moon', 'alpha_centauri', 'custom'];

const RAD = Math.PI / 180;
const rev = (x: number) => ((x % 360) + 360) % 360;
const sind = (x: number) => Math.sin(x * RAD);
const cosd = (x: number) => Math.cos(x * RAD);

export const ALPHA_CENTAURI = { raHours: 14 + 39 / 60 + 36.494 / 3600, decDeg: -(60 + 50 / 60 + 2.37 / 3600) };

/** Greenwich mean sidereal time in hours (USNO). */
export function gmstHours(at: Date): number {
  const jd = at.getTime() / 86_400_000 + 2440587.5;
  const jd0 = Math.floor(jd - 0.5) + 0.5;
  const h = (jd - jd0) * 24;
  const d = jd0 - 2451545.0;
  return (((6.697375 + 0.065709824279 * d + 1.0027379 * h) % 24) + 24) % 24;
}

/** The Moon's geocentric RA (hours), Dec (degrees) and distance (Earth radii), after Schlyter. */
export function moonRaDec(at: Date): { raHours: number; decDeg: number; distanceEarthRadii: number } {
  // Schlyter's day number: days since 2000 Jan 0.0 UT.
  const d = at.getTime() / 86_400_000 + 2440587.5 - 2451543.5;
  const N = rev(125.1228 - 0.0529538083 * d);
  const i = 5.1454;
  const w = rev(318.0634 + 0.1643573223 * d);
  const a = 60.2666;
  const e = 0.0549;
  const M = rev(115.3654 + 13.0649929509 * d);
  // Eccentric anomaly by iteration.
  let E = M + (180 / Math.PI) * e * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 5; k++) E = E - (E - (180 / Math.PI) * e * sind(E) - M) / (1 - e * cosd(E));
  const xv = a * (cosd(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD;
  let r = Math.hypot(xv, yv);
  const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
  const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
  const zh = r * sind(v + w) * sind(i);
  let lon = Math.atan2(yh, xh) / RAD;
  let lat = Math.atan2(zh, Math.hypot(xh, yh)) / RAD;

  const Ms = rev(356.047 + 0.9856002585 * d);
  const ws = 282.9404 + 4.70935e-5 * d;
  const Ls = Ms + ws;
  const Lm = M + w + N;
  const D = Lm - Ls;
  const F = Lm - N;
  lon +=
    -1.274 * sind(M - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * M - 2 * D) - 0.057 * sind(M - 2 * D + Ms) +
    0.053 * sind(M + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(M - Ms) - 0.035 * sind(D) - 0.031 * sind(M + Ms) -
    0.015 * sind(2 * F - 2 * D) + 0.011 * sind(M - 4 * D);
  lat += -0.173 * sind(F - 2 * D) - 0.055 * sind(M - F - 2 * D) - 0.046 * sind(M + F - 2 * D) + 0.033 * sind(F + 2 * D) + 0.017 * sind(2 * M + F);
  r += -0.58 * cosd(M - 2 * D) - 0.46 * cosd(2 * D);

  const ecl = 23.4393 - 3.563e-7 * d;
  const xg = cosd(lon) * cosd(lat);
  const yg = sind(lon) * cosd(lat);
  const zg = sind(lat);
  const xe = xg;
  const ye = yg * cosd(ecl) - zg * sind(ecl);
  const ze = yg * sind(ecl) + zg * cosd(ecl);
  return { raHours: rev(Math.atan2(ye, xe) / RAD) / 15, decDeg: Math.atan2(ze, Math.hypot(xe, ye)) / RAD, distanceEarthRadii: r };
}

/** Azimuth (degrees east of true north) and elevation (degrees above the horizon) of an RA/Dec from a place at a time. */
export function altAz(raHours: number, decDeg: number, latDeg: number, lonDeg: number, at: Date): { az: number; el: number } {
  const ha = rev((gmstHours(at) + lonDeg / 15 - raHours) * 15);
  const x = cosd(ha) * cosd(decDeg);
  const y = sind(ha) * cosd(decDeg);
  const z = sind(decDeg);
  const xhor = x * sind(latDeg) - z * cosd(latDeg);
  const zhor = x * cosd(latDeg) + z * sind(latDeg);
  return { az: rev(Math.atan2(y, xhor) / RAD + 180), el: Math.asin(Math.max(-1, Math.min(1, zhor))) / RAD };
}

export interface Pointing {
  az: number;
  el: number;
}

/** Where to point for a target, or null for a custom target without coordinates. */
export function pointAt(target: SkyTarget, latDeg: number, lonDeg: number, at: Date, custom?: { raHours: number; decDeg: number } | null): Pointing | null {
  if (target === 'zenith') return { az: 0, el: 90 };
  if (target === 'alpha_centauri') return altAz(ALPHA_CENTAURI.raHours, ALPHA_CENTAURI.decDeg, latDeg, lonDeg, at);
  if (target === 'custom') return custom ? altAz(custom.raHours, custom.decDeg, latDeg, lonDeg, at) : null;
  const m = moonRaDec(at);
  const p = altAz(m.raHours, m.decDeg, latDeg, lonDeg, at);
  // Seen from the surface the Moon sits lower than from Earth's centre, by up to a degree (Schlyter).
  return { az: p.az, el: p.el - (Math.asin(1 / m.distanceEarthRadii) / RAD) * cosd(p.el) };
}

/** The next time within `hours` that the target crosses minEl (rising or setting), in 2-minute steps; null if it doesn't. */
export function nextCrossing(target: SkyTarget, latDeg: number, lonDeg: number, from: Date, minEl: number, custom?: { raHours: number; decDeg: number } | null, hours = 36) {
  const first = pointAt(target, latDeg, lonDeg, from, custom);
  if (!first) return null;
  const above = first.el >= minEl;
  for (let t = 2; t <= hours * 60; t += 2) {
    const at = new Date(from.getTime() + t * 60_000);
    const p = pointAt(target, latDeg, lonDeg, at, custom)!;
    if (p.el >= minEl !== above) return { at: at.toISOString(), rising: !above };
  }
  return null;
}
