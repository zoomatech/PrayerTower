// A neon glass tube, drawn (Steve, 2026-10-30, for the Tron-style Neon Circuit skin): "close
// to white in the middle and darker shades of color toward the edge of the glass", with a
// radiant glow around it. Any skin can bend these tubes along its own lines.
import { useId } from 'react';
import { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const HEX = /^#[0-9A-Fa-f]{6}$/;

function mix(a: string, b: string, t: number) {
  if (!HEX.test(a) || !HEX.test(b)) return a;
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** The shades across the glass, from its edge to its core. */
export function tubeShades(color: string) {
  return { edge: mix(color, '#000000', 0.3), body: color, inner: mix(color, '#FFFFFF', 0.55), core: mix(color, '#FFFFFF', 0.92) };
}

/** How far the glow reaches past the glass on each side, so a drawing can leave room for it. */
export const GLOW_REACH = 14;
// Faint layers that build up toward the glass, so the glow fades smoothly outward.
const GLOW = [GLOW_REACH * 2, 21, 16, 12, 8, 4];

/**
 * `blend` makes the tube change color gradually along a straight run: `color` at (x1, y1),
 * shading over to `blend.to` at (x2, y2) (a red box's connector turning blue at the wire).
 */
export function GlassTube({ d, color, width = 5, blend }: { d: string; color: string; width?: number; blend?: { to: string; x1?: number; x2?: number; y1?: number; y2?: number } }) {
  const id = `tube${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const a = tubeShades(color);
  const b = blend ? tubeShades(blend.to) : a;
  const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const layers = [
    ['glow', color, blend?.to ?? color],
    ['edge', a.edge, b.edge],
    ['body', a.body, b.body],
    ['inner', a.inner, b.inner],
    ['core', a.core, b.core],
  ] as const;
  const paint = (name: string, solid: string) => (blend ? `url(#${id}${name})` : solid);
  return (
    <>
      {blend ? (
        <Defs>
          {layers.map(([name, from, to]) => (
            <LinearGradient key={name} id={`${id}${name}`} gradientUnits="userSpaceOnUse" x1={blend.x1 ?? 0} y1={blend.y1 ?? 0} x2={blend.x2 ?? 0} y2={blend.y2 ?? 0}>
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          ))}
        </Defs>
      ) : null}
      {GLOW.map((g) => (
        <Path key={g} d={d} stroke={paint('glow', color)} strokeOpacity={0.09} strokeWidth={width + g} {...line} />
      ))}
      <Path d={d} stroke={paint('edge', a.edge)} strokeWidth={width} {...line} />
      <Path d={d} stroke={paint('body', a.body)} strokeWidth={width * 0.72} {...line} />
      <Path d={d} stroke={paint('inner', a.inner)} strokeWidth={width * 0.45} {...line} />
      <Path d={d} stroke={paint('core', a.core)} strokeWidth={Math.max(0.8, width * 0.22)} {...line} />
    </>
  );
}

/**
 * A rectangle path with elegantly rounded corners (never a circle or oval), inset by `e`.
 * One closed tube, with no gaps anywhere (Steve, 2026-10-30).
 */
export function roundedBox(w: number, h: number, r: number, e = 0) {
  const k = r * 0.45;
  return `M ${e + r} ${e} L ${w - e - r} ${e} C ${w - e - k} ${e}, ${w - e} ${e + k}, ${w - e} ${e + r} L ${w - e} ${h - e - r} C ${w - e} ${h - e - k}, ${w - e - k} ${h - e}, ${w - e - r} ${h - e} L ${e + r} ${h - e} C ${e + k} ${h - e}, ${e} ${h - e - k}, ${e} ${h - e - r} L ${e} ${e + r} C ${e} ${e + k}, ${e + k} ${e}, ${e + r} ${e} Z`;
}
