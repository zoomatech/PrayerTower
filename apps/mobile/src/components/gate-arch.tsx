// The gate at the top of the Moonlit Gate feed: a drawing in fine lines of
// silver light on the night sky, the way old drawings of moonlit doors show
// only their tracery. Two pillars with capitals, a double arch with a ring of
// small stars, one large star in the doorway, a slender tree climbing each
// pillar with its branches meeting over the arch, a crescent moon and a
// threshold. Original artwork, drawn here; the feed's line of light starts at
// the foot of the doorway. Decorative only, so screen readers skip it.
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Rod, sparkle, vineGeometry } from './vine-flow';

/** An eight-rayed star: long rays on the four winds, short ones between. */
function bigStar(x: number, y: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const len = i % 4 === 0 ? r : i % 2 === 0 ? r * 0.55 : r * 0.16;
    pts.push(`${(x + len * Math.cos(a)).toFixed(1)} ${(y + len * Math.sin(a)).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** A small almond leaf at (x, y) pointing along angle `a`. */
function leaf(x: number, y: number, a: number, len = 9) {
  const tx = x + len * Math.cos(a);
  const ty = y + len * Math.sin(a);
  const nx = -Math.sin(a) * len * 0.32;
  const ny = Math.cos(a) * len * 0.32;
  const mx = (x + tx) / 2;
  const my = (y + ty) / 2;
  return `M ${x} ${y} Q ${mx + nx} ${my + ny}, ${tx} ${ty} Q ${mx - nx} ${my - ny}, ${x} ${y} Z`;
}

/** A point on the arch's ellipse at angle t (0 = right foot, PI = left foot). */
function onArch(cx: number, cy: number, rx: number, ry: number, t: number) {
  return { x: cx + rx * Math.cos(t), y: cy - ry * Math.sin(t) };
}

export function GateArch({ line, accent, testID }: { line: string; accent: string; testID?: string }) {
  const [w, setW] = useState(0);
  const h = Math.min(360, Math.max(240, w * 0.78));
  const cx = w / 2;
  // Pillars stand at a fifth of the way in from each side; the arch springs from their capitals.
  const px = w * 0.2;
  const pw = Math.max(10, w * 0.045);
  const springY = h * 0.46;
  const rx = cx - px;
  const ry = springY - h * 0.08;
  const arch = (inset: number) => `M ${px + inset} ${springY} A ${rx - inset} ${ry - inset} 0 0 1 ${w - px - inset} ${springY}`;
  const pillar = (x: number) =>
    `M ${x - pw / 2} ${h - 18} L ${x - pw / 2} ${springY + 10} L ${x - pw} ${springY + 10} L ${x - pw} ${springY} L ${x + pw} ${springY} L ${x + pw} ${springY + 10} L ${x + pw / 2} ${springY + 10} L ${x + pw / 2} ${h - 18}`;
  const stars = Array.from({ length: 9 }, (_, i) => onArch(cx, springY, rx - 16, ry - 16, (Math.PI * (i + 1)) / 10));
  // Each tree rises outside its pillar, then bends in over the arch.
  const tree = (dir: 1 | -1) => {
    const base = dir === 1 ? px - pw - 10 : w - px + pw + 10;
    const top = onArch(cx, springY, rx + 14, ry + 14, dir === 1 ? Math.PI * 0.62 : Math.PI * 0.38);
    return {
      d: `M ${base} ${h - 18} C ${base - dir * 6} ${h * 0.7}, ${base + dir * 4} ${springY + 20}, ${base} ${springY - 10} S ${top.x - dir * 30} ${top.y + 6}, ${top.x} ${top.y}`,
      leaves: [0.3, 0.42, 0.52, 0.6, 0.66].flatMap((t, k) => {
        const p = onArch(cx, springY, rx + 12 + (k % 2) * 8, ry + 12 + (k % 2) * 8, dir === 1 ? Math.PI * (1 - t * 0.62) : Math.PI * t * 0.62);
        return [leaf(p.x, p.y, -Math.PI / 2 - dir * 0.6), leaf(p.x, p.y, -Math.PI / 2 + dir * 0.9, 7)];
      }),
    };
  };
  const trees = w ? [tree(1), tree(-1)] : [];
  const sx = vineGeometry(w || 1, 'right', 0).stalkX;
  return (
    <View
      style={{ height: h }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}>
      {w ? (
        <Svg width={w} height={h} pointerEvents="none">
          {/* A crescent moon in the upper corner. */}
          <Path d={`M ${w - 46} 22 A 18 18 0 1 0 ${w - 46} 58 A 13 13 0 1 1 ${w - 46} 22 Z`} fill={line} fillOpacity={0.9} />
          {trees.map((t, i) => (
            <Path key={`t${i}`} d={t.d} stroke={accent} strokeWidth={1.4} fill="none" strokeOpacity={0.9} />
          ))}
          {trees.flatMap((t, i) => t.leaves.map((d, k) => <Path key={`l${i}-${k}`} d={d} stroke={accent} strokeWidth={0.8} fill={accent} fillOpacity={0.18} />))}
          <Rod d={arch(0)} color={line} width={1.8} fine />
          <Path d={arch(10)} stroke={line} strokeOpacity={0.6} strokeWidth={0.9} fill="none" />
          <Rod d={pillar(px)} color={line} width={1.5} fine />
          <Rod d={pillar(w - px)} color={line} width={1.5} fine />
          {stars.map((p, i) => (
            <Path key={`s${i}`} d={sparkle(p.x, p.y, i % 2 ? 4 : 6)} fill="#FFFFFF" stroke={line} strokeWidth={0.6} />
          ))}
          <Rod d={bigStar(cx, springY + (h - springY) * 0.1, Math.min(44, w * 0.11))} color={line} width={1.2} fine />
          {/* The feed's line of light leaves the doorway and runs down to the stalk below. */}
          <Rod d={`M ${cx} ${h - 18} L ${cx} ${h - 8} L ${sx} ${h - 8} L ${sx} ${h}`} color={line} width={1.4} fine />
          {/* The threshold and two steps. */}
          <Rod d={`M ${px - pw * 2} ${h - 18} L ${w - px + pw * 2} ${h - 18}`} color={line} width={1.4} fine />
          <Path d={`M ${px - pw * 3} ${h - 10} L ${w - px + pw * 3} ${h - 10} M ${px - pw * 4} ${h - 3} L ${w - px + pw * 4} ${h - 3}`} stroke={line} strokeOpacity={0.5} strokeWidth={0.8} />
        </Svg>
      ) : null}
    </View>
  );
}
