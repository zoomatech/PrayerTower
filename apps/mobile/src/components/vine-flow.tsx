// The drawn vine (Steve, 2026-10-29). The lines run mostly up and down, like a
// fairy-tale beanstalk: one tall stalk runs top to bottom (present to past) and
// each post or comment hangs off it on a short stem, inside a real leaf. The
// leaf is drawn whole (pointed base and tip, midrib, veins), and the post sits
// in a smaller, greener box on it; the box may cross the leaf's edge so the leaf
// keeps a natural shape. Each row draws its own piece of the stalk, so together
// they make one plant. A transparent drawing (react-native-svg) behind the leaves.
//
// Styles (token `vineStyle`):
//  - ''          a single gently swaying stalk.
//  - 'beanstalk' two thick strands twisting round each other, with curling tendrils.
//  - 'ink'       a pen-and-ink drawing: dark outlines on trunk and leaves, flat colors.
//  - 'neon'      not a plant at all: straight glowing rods with hard right-angle joins
//                and cut-corner frames, the way neon tubes glow (Neon Cinderella).
//  - 'floral'    a climbing rose (Blossom Garden): a slender stem twined with a
//                tendril, small thorns, blossoms and buds along it, and each post in
//                a frame with a scalloped petal edge and a drawn rose at its top.
//  - 'gate'      fine lines of silver light on a night sky (Moonlit Gate): a thin
//                line of light runs down from the gate drawn at the top of the feed,
//                and each post sits in a little arched doorway of light.
//
// On a phone the stalk runs down the left edge and the leaves hang to its right;
// on a wide lane (iPad, Mac) it runs down the middle with leaves on both sides.
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space } from '@/lib/theme';

export type VineSide = 'left' | 'right';
export type VineStyle = '' | 'beanstalk' | 'ink' | 'neon' | 'gate' | 'floral';

/** Styles drawn in light on a dark sky rather than as a plant. */
export const isLit = (style: VineStyle) => style === 'neon' || style === 'gate';

export interface VineLook {
  stem: string;
  leaf: string;
  leafSoft: string;
  tendril: string;
  stemWidth: number;
  stemDouble: boolean;
  stemGlow: boolean;
  backdrop: string;
  vineStyle: VineStyle;
  ink: string;
}

/** The open space above each leaf. */
export const VINE_GAP = 44;
/** A lane at least this wide puts the stalk in the middle, with leaves on both sides. */
const CENTER_LANE = 760;
/** Where the stalk runs on a phone, from the left edge. */
const EDGE_X = 20;
/** Space above and below the box inside a leaf, where the leaf's base and tip show. */
const LEAF_PAD = [54, 34, 28] as const;

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function mix(a: string, b: string, t: number) {
  if (!HEX.test(a) || !HEX.test(b)) return a;
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The box inside a leaf: the soft color, tinted toward the leaf so it reads as part
 * of it, but never so far that the card's text (dark, muted grey or the link color)
 * drops under 4.5:1 (WCAG AA).
 */
export function leafBox(look: VineLook) {
  if (look.vineStyle === 'neon') return '#F4EEFF';
  if (look.vineStyle === 'gate') return '#EEF3FA';
  for (const t of [0.45, 0.35, 0.25, 0.15]) {
    const c = mix(look.leafSoft, look.leaf, t);
    if (HEX.test(c) && [COMMENT_TEXT, colors.textMuted, colors.primary].every((text) => contrastRatio(c, text) >= 4.5)) return c;
  }
  return look.leafSoft;
}

/** How a row lays out at a given width. Exported for tests. */
export function vineGeometry(w: number, side: VineSide, depth: number) {
  const centered = w >= CENTER_LANE;
  const stalkX = centered ? w / 2 : EDGE_X;
  if (!centered) {
    // Comments step a little further out from the stalk, spreading down toward the next post.
    const left = 38 + depth * 18;
    return { centered, stalkX, leafLeft: left, leafWidth: w - left };
  }
  const leafWidth = w / 2 - 34 - depth * 26;
  return { centered, stalkX, leafLeft: side === 'left' ? w / 2 - 22 - leafWidth : w / 2 + 22, leafWidth };
}

/** The stalk through one row: a gentle S of sway, ending where it started so rows join smoothly. */
export function stalkPath(x: number, h: number, sway: number) {
  return `M ${x} 0 C ${x} ${h * 0.25}, ${x + sway} ${h * 0.25}, ${x + sway} ${h * 0.5} C ${x + sway} ${h * 0.75}, ${x} ${h * 0.75}, ${x} ${h}`;
}

/** One strand of a twisting beanstalk: a whole number of turns per row, so strands meet at row joins. */
function strand(x: number, h: number, amp: number, phase: number) {
  const turns = Math.max(1, Math.round(h / 170));
  const pts: string[] = [];
  for (let y = 0; y <= h; y += 6) pts.push(`${(x + amp * Math.sin((y / h) * turns * 2 * Math.PI + phase)).toFixed(1)} ${y}`);
  pts.push(`${(x + amp * Math.sin(turns * 2 * Math.PI + phase)).toFixed(1)} ${h}`);
  return `M ${pts.join(' L ')}`;
}

/** A tendril: a spiral curling away from the stalk. */
function curl(x: number, y: number, dir: 1 | -1, size = 1) {
  const d = dir * size;
  return `M ${x} ${y} c ${12 * d} -4, ${26 * d} -16, ${20 * d} -28 c ${-4 * d} -8, ${-15 * d} -6, ${-14 * d} 3 c ${1 * d} 6, ${8 * d} 6, ${8 * d} 0`;
}

/** A four-pointed star of light, centered on (x, y). */
export function sparkle(x: number, y: number, r: number) {
  const k = r * 0.28;
  return `M ${x} ${y - r} L ${x + k} ${y - k} L ${x + r} ${y} L ${x + k} ${y + k} L ${x} ${y + r} L ${x - k} ${y + k} L ${x - r} ${y} L ${x - k} ${y - k} Z`;
}

/** An arched doorway: straight sides and foot, a pointed arch on top (Moonlit Gate's frames). */
export function doorway(w: number, h: number, inset: number, arch: number) {
  const l = inset;
  const r = w - inset;
  const top = inset;
  const spring = top + arch;
  return `M ${l} ${h - inset} L ${l} ${spring} C ${l} ${top + arch * 0.35}, ${w * 0.3} ${top}, ${w / 2} ${top} C ${w * 0.7} ${top}, ${r} ${top + arch * 0.35}, ${r} ${spring} L ${r} ${h - inset} Z`;
}

/** A five-petal blossom centered on (x, y), petals of length r. */
export function blossomPetals(x: number, y: number, r: number, turn = 0) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = turn + (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const tx = x + r * Math.cos(a);
    const ty = y + r * Math.sin(a);
    const w = r * 0.62;
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    return `M ${x} ${y} C ${(x + nx + (tx - x) * 0.3).toFixed(1)} ${(y + ny + (ty - y) * 0.3).toFixed(1)}, ${(tx + nx * 0.6).toFixed(1)} ${(ty + ny * 0.6).toFixed(1)}, ${tx.toFixed(1)} ${ty.toFixed(1)} C ${(tx - nx * 0.6).toFixed(1)} ${(ty - ny * 0.6).toFixed(1)}, ${(x - nx + (tx - x) * 0.3).toFixed(1)} ${(y - ny + (ty - y) * 0.3).toFixed(1)}, ${x} ${y} Z`;
  }).join(' ');
}

/** A rose seen from above: a ring of outer petals and a tight spiral at the heart. */
function Rose({ x, y, r, petal, heart }: { x: number; y: number; r: number; petal: string; heart: string }) {
  const spiral: string[] = [];
  for (let t = 0; t <= 4 * Math.PI; t += 0.35) {
    const rr = r * 0.12 + (r * 0.5 * t) / (4 * Math.PI);
    spiral.push(`${(x + rr * Math.cos(t)).toFixed(1)} ${(y + rr * Math.sin(t)).toFixed(1)}`);
  }
  return (
    <>
      <Path d={`M ${x - r * 0.9} ${y + r * 0.4} q ${-r * 0.9} ${-r * 0.1}, ${-r * 1.4} ${r * 0.6} q ${r * 0.8} ${r * 0.3}, ${r * 1.4} ${-r * 0.6} z M ${x + r * 0.9} ${y + r * 0.4} q ${r * 0.9} ${-r * 0.1}, ${r * 1.4} ${r * 0.6} q ${-r * 0.8} ${r * 0.3}, ${-r * 1.4} ${-r * 0.6} z`} fill="#7FA36A" stroke="#557A44" strokeWidth={0.8} />
      <Path d={blossomPetals(x, y, r, 0.3)} fill={petal} stroke={mix(petal, '#000000', 0.25)} strokeWidth={0.8} />
      <Path d={blossomPetals(x, y, r * 0.7, 0.9)} fill={mix(petal, heart, 0.35)} stroke={mix(petal, '#000000', 0.3)} strokeWidth={0.6} />
      <Path d={`M ${spiral.join(' L ')}`} stroke={heart} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </>
  );
}

/** A rounded frame whose edge is a chain of petal scallops. */
function scallops(w: number, h: number, inset: number, size: number) {
  const pts: string[] = [];
  const nx = Math.max(3, Math.round((w - inset * 2) / size));
  const ny = Math.max(2, Math.round((h - inset * 2) / size));
  const sx = (w - inset * 2) / nx;
  const sy = (h - inset * 2) / ny;
  const l = inset;
  const t = inset;
  const r = w - inset;
  const b = h - inset;
  let d = `M ${l} ${t}`;
  for (let i = 0; i < nx; i++) d += ` Q ${l + sx * (i + 0.5)} ${t - sy * 0.45 - 2}, ${l + sx * (i + 1)} ${t}`;
  for (let i = 0; i < ny; i++) d += ` Q ${r + sx * 0.45 + 2} ${t + sy * (i + 0.5)}, ${r} ${t + sy * (i + 1)}`;
  for (let i = nx - 1; i >= 0; i--) d += ` Q ${l + sx * (i + 0.5)} ${b + sy * 0.45 + 2}, ${l + sx * i} ${b}`;
  for (let i = ny - 1; i >= 0; i--) d += ` Q ${l - sx * 0.45 - 2} ${t + sy * (i + 0.5)}, ${l} ${t + sy * i}`;
  pts.push(d + ' Z');
  return pts.join(' ');
}

/** A small leaf on the stalk itself. */
function sprig(x: number, y: number, dir: 1 | -1) {
  const d = dir;
  return `M ${x} ${y} q ${12 * d} -18, ${32 * d} -12 q ${-10 * d} 16, ${-32 * d} 12 z`;
}

/**
 * The shades across a glass neon tube (Steve, 2026-10-30): "close to white in the
 * middle and darker shades of color toward the edge of the glass", with a radiant
 * glow around it.
 */
const GLOW = [26, 21, 16, 12, 8, 4];

export function tubeShades(color: string) {
  return { edge: mix(color, '#000000', 0.3), body: color, inner: mix(color, '#FFFFFF', 0.55), core: mix(color, '#FFFFFF', 0.92) };
}

/**
 * A neon tube: a radiant glow around the glass, the glass deepest in color at its
 * edges, lightening inward to a near-white core. `fine` is a thread of light
 * (Moonlit Gate): a bloom, a halo and a thin white core, drawn closer in.
 */
export function Rod({ d, color, width = 4, fine = false }: { d: string; color: string; width?: number; fine?: boolean }) {
  if (!fine) {
    const t = tubeShades(color);
    const line = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
    return (
      <>
        {/* The radiant glow: faint layers that build up toward the glass, so it fades smoothly outward. */}
        {GLOW.map((g) => (
          <Path key={g} d={d} stroke={color} strokeOpacity={0.09} strokeWidth={width + g} {...line} />
        ))}
        <Path d={d} stroke={t.edge} strokeWidth={width} {...line} />
        <Path d={d} stroke={t.body} strokeWidth={width * 0.72} {...line} />
        <Path d={d} stroke={t.inner} strokeWidth={width * 0.45} {...line} />
        <Path d={d} stroke={t.core} strokeWidth={Math.max(0.8, width * 0.22)} {...line} />
      </>
    );
  }
  return (
    <>
      <Path d={d} stroke={color} strokeOpacity={fine ? 0.1 : 0.14} strokeWidth={width + (fine ? 8 : 14)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} stroke={color} strokeOpacity={fine ? 0.3 : 0.35} strokeWidth={width + (fine ? 3 : 6)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={Math.max(0.8, width / 3)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/**
 * One row of the plant: a piece of the stalk, and (for a post or comment) the
 * stem out to its leaf. `side` says which side of a centered stalk the leaf hangs
 * on; 'center' is a verse, a scene or a "more" link that sits over the stalk.
 */
/** A spark of current running down a neon rod, again and again (Neon Cinderella). */
function Spark({ x, h, color, seed }: { x: number; h: number; color: string; seed: number }) {
  const run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay((seed % 5) * 450),
        Animated.timing(run, { toValue: 1, duration: 1500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(run, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(2200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [run, seed]);
  const y = run.interpolate({ inputRange: [0, 1], outputRange: [-24, h] });
  return (
    <>
      {/* A fading tail, then the white-hot head with the tube's color blooming round it. */}
      <Animated.View pointerEvents="none" style={[styles.sparkTail, { left: x - 2, backgroundColor: color, transform: [{ translateY: y }] }]} />
      <Animated.View pointerEvents="none" style={[styles.spark, { left: x - 4, shadowColor: color, transform: [{ translateY: Animated.add(y, 18) }] }]} />
    </>
  );
}

export function VineRow({
  side,
  look,
  gap = VINE_GAP,
  depth = 0,
  seed = 0,
  grow = false,
  testID,
  children,
}: {
  /** Kept for callers; the stalk no longer needs to know where the row above ended. */
  from?: VineSide | 'center' | null;
  side: VineSide | 'center';
  look: VineLook;
  gap?: number;
  depth?: number;
  seed?: number;
  /** A new post just arrived: the stalk grows down into this row. */
  grow?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const reduced = useReducedMotion();
  const reveal = useRef(new Animated.Value(grow && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!grow || reduced) return reveal.setValue(1);
    Animated.timing(reveal, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow, reduced, reveal]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };
  const { w, h } = size;
  const leafSide: VineSide = side === 'center' ? 'right' : side;
  const g = vineGeometry(w || 1, leafSide, depth);
  const sx = g.stalkX;
  const out: 1 | -1 = g.centered ? (leafSide === 'left' ? 1 : -1) : 1; // tendrils curl away from the leaf
  const neon = look.vineStyle === 'neon';
  const gate = look.vineStyle === 'gate';
  const floral = look.vineStyle === 'floral';
  const sw = look.stemWidth;
  const sway = neon || gate ? 0 : (seed % 2 === 0 ? 1 : -1) * Math.min(8, sw + 3);
  // The stem from the stalk out to the leaf's base, at the top middle of the leaf.
  const baseX = g.leafLeft + g.leafWidth / 2;
  const baseY = gap + 6;
  const fromY = gap + 26;
  const stem =
    side === 'center' || !w
      ? ''
      : gate
        ? `M ${sx} ${baseY - 3} L ${baseX} ${baseY - 3}`
        : neon
        ? `M ${sx} ${fromY} C ${sx} ${gap - 10}, ${baseX} ${gap - 14}, ${baseX} ${baseY}`
        : `M ${sx} ${fromY} C ${sx + (baseX - sx) * 0.15} ${gap - 14}, ${baseX - (baseX - sx) * 0.3} ${gap - 18}, ${baseX} ${baseY}`;
  const stemW = Math.max(2, sw * (depth > 0 ? 0.35 : 0.5));
  const placed: ViewStyle | null = side === 'center' ? (g.centered ? null : { marginLeft: g.leafLeft }) : { marginLeft: g.leafLeft, width: g.leafWidth };

  let stalk: ReactNode = null;
  if (w && h) {
    if (floral) {
      // A climbing rose: the stem, a tendril twining round it, thorns, and blossoms and buds along it.
      const path = stalkPath(sx, h, sway);
      const twine = strand(sx, h, Math.max(4, sw + 2), seed);
      const blooms = [0.28, 0.7].filter((t) => h * t > 30 && h > 120);
      stalk = (
        <>
          <Path d={twine} stroke={look.tendril} strokeOpacity={0.7} strokeWidth={1.2} fill="none" />
          <Path d={path} stroke={look.stem} strokeWidth={sw} fill="none" strokeLinecap="round" />
          {stem ? <Path d={stem} stroke={look.stem} strokeWidth={stemW} fill="none" strokeLinecap="round" /> : null}
          {[0.15, 0.45, 0.6, 0.88].map((t) => (
            <Path key={t} d={`M ${sx} ${h * t} l ${-out * 5} -3 l ${out * 1} 4 z`} fill={look.stem} />
          ))}
          {h > 120 ? <Path d={sprig(sx, h * 0.84, (-out) as 1 | -1)} fill={mix(look.stem, '#FFFFFF', 0.25)} stroke={look.stem} strokeWidth={0.8} /> : null}
          {blooms.map((t, i) => (
            <Path key={t} d={blossomPetals(sx + (i % 2 ? out : -out) * 9, h * t, 8, seed)} fill={look.leaf} stroke={mix(look.leaf, '#000000', 0.25)} strokeWidth={0.7} />
          ))}
          {blooms.map((t, i) => (
            <Circle key={`c${t}`} cx={sx + (i % 2 ? out : -out) * 9} cy={h * t} r={2.2} fill="#E8B84A" />
          ))}
          {h > 200 ? <Path d={`M ${sx} ${h * 0.52} q ${-out * 10} -4, ${-out * 12} -14 q ${out * 6} 2, ${out * 12} 14 z`} fill={mix(look.leaf, '#000000', 0.12)} /> : null}
        </>
      );
    } else if (gate) {
      // A thread of light straight down, with a few small stars caught on it.
      stalk = (
        <>
          <Rod d={`M ${sx} 0 L ${sx} ${h}`} color={look.stem} width={1.4} fine />
          {stem ? <Rod d={stem} color={look.stem} width={1.2} fine /> : null}
          {[0.3, 0.72].map((t) => (h > 120 ? <Path key={t} d={sparkle(sx, h * t, 5)} fill="#FFFFFF" stroke={look.stem} strokeWidth={0.6} /> : null))}
        </>
      );
    } else if (neon) {
      stalk = (
        <>
          <Rod d={`M ${sx} 0 L ${sx} ${h}`} color={look.stem} width={Math.max(6, sw + 3)} />
          {stem ? <Rod d={stem} color={look.stem} width={5} /> : null}
          {stem ? <Circle cx={sx} cy={fromY} r={4} fill="#FFFFFF" stroke={look.stem} strokeWidth={2} /> : null}
        </>
      );
    } else if (look.vineStyle === 'beanstalk') {
      const amp = Math.max(3, sw * 0.45);
      const dark = mix(look.stem, '#000000', 0.25);
      stalk = (
        <>
          <Path d={strand(sx, h, amp, Math.PI)} stroke={dark} strokeWidth={sw * 0.75} fill="none" strokeLinecap="round" />
          <Path d={strand(sx, h, amp, 0)} stroke={look.stem} strokeWidth={sw * 0.75} fill="none" strokeLinecap="round" />
          {stem ? <Path d={stem} stroke={look.stem} strokeWidth={stemW} fill="none" strokeLinecap="round" /> : null}
          {h > 140 ? <Path d={curl(sx, h * 0.7, (-out) as 1 | -1, 1.2)} stroke={look.tendril} strokeWidth={2} fill="none" strokeLinecap="round" /> : null}
          {h > 220 ? <Path d={curl(sx, h * 0.38, out, 0.9)} stroke={look.tendril} strokeWidth={1.8} fill="none" strokeLinecap="round" /> : null}
        </>
      );
    } else {
      const path = stalkPath(sx, h, sway);
      const ink = look.vineStyle === 'ink' ? look.ink || '#3A2E1F' : '';
      const lineW = look.stemDouble ? sw * 3 : sw;
      stalk = (
        <>
          {look.stemGlow ? <Path d={path} stroke={look.stem} strokeOpacity={0.25} strokeWidth={sw + 10} fill="none" strokeLinecap="round" /> : null}
          {ink ? <Path d={path} stroke={ink} strokeWidth={lineW + 3} fill="none" strokeLinecap="round" /> : null}
          <Path d={path} stroke={look.stem} strokeWidth={lineW} fill="none" strokeLinecap="round" />
          {look.stemDouble ? <Path d={path} stroke={look.backdrop || colors.background} strokeWidth={lineW - 3} fill="none" strokeLinecap="round" /> : null}
          {stem ? (
            <>
              {ink ? <Path d={stem} stroke={ink} strokeWidth={stemW + 2} fill="none" strokeLinecap="round" /> : null}
              <Path d={stem} stroke={look.stem} strokeWidth={stemW} fill="none" strokeLinecap="round" />
            </>
          ) : null}
          {h > 160 ? <Path d={curl(sx, h * 0.66, (-out) as 1 | -1)} stroke={ink || look.tendril} strokeWidth={1.6} fill="none" strokeLinecap="round" /> : null}
          {h > 120 ? <Path d={sprig(sx, h * 0.84, (-out) as 1 | -1)} fill={look.leaf} stroke={ink || look.stem} strokeWidth={ink ? 1.4 : 0.8} /> : null}
        </>
      );
    }
  }

  return (
    <View style={[styles.row, { paddingTop: gap }]} onLayout={onLayout} testID={testID}>
      {stalk ? (
        // The drawing is uncovered from the top down, so a new row's stalk grows into place.
        <Animated.View style={[styles.reveal, { width: w, height: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) }]} pointerEvents="none">
          <Svg aria-hidden width={w} height={h} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {stalk}
          </Svg>
        </Animated.View>
      ) : null}
      {/* A spark on every third piece of rod, not all of them: each one is an animation running all the time, and older phones dropped frames with one per row. */}
      {neon && h && !reduced && seed % 3 === 0 ? <Spark x={sx} h={h} color={look.stem} seed={seed} /> : null}
      <View style={placed}>{children}</View>
    </View>
  );
}

/**
 * A whole leaf with a post or comment on it. The leaf is drawn: a pointed base at
 * the top (where the stem joins), a pointed tip at the bottom, a midrib and veins.
 * The content sits in a smaller box on the leaf; on a neon skin the leaf is a
 * glowing frame with cut corners instead.
 */
export function LeafFrame({
  look,
  depth = 0,
  highlighted = false,
  bare = false,
  mark,
  children,
}: {
  side?: VineSide;
  look: VineLook;
  depth?: number;
  highlighted?: boolean;
  /** The content brings its own box (a feed card, restyled through CardSurface). */
  bare?: boolean;
  mark?: ReactNode;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { w, h } = size;
  const neon = look.vineStyle === 'neon';
  const gate = look.vineStyle === 'gate';
  const floral = look.vineStyle === 'floral';
  const arch = Math.min(72, Math.max(30, w * 0.22));
  const ink = look.vineStyle === 'ink' ? look.ink || '#3A2E1F' : '';
  const pad = LEAF_PAD[Math.min(depth, 2) as 0 | 1 | 2];
  // A leaf: widest a little above the middle, narrowing to a point at both ends.
  const leaf = `M ${w / 2} 0 C ${w * 1.04} ${h * 0.14}, ${w * 1.06} ${h * 0.66}, ${w / 2} ${h} C ${w * -0.06} ${h * 0.66}, ${w * -0.04} ${h * 0.14}, ${w / 2} 0 Z`;
  const veins = [0.2, 0.36, 0.52, 0.68]
    .map((t) => {
      const y = h * t;
      // Veins stay inside the leaf's outline: shortest near the base and the tip.
      const reach = w * 0.34 * (1 - Math.abs(t - 0.45) * 1.5);
      return `M ${w / 2} ${y} Q ${w / 2 + reach * 0.5} ${y - 6}, ${w / 2 + reach} ${y - h * 0.08} M ${w / 2} ${y} Q ${w / 2 - reach * 0.5} ${y - 6}, ${w / 2 - reach} ${y - h * 0.08}`;
    })
    .join(' ');
  // The neon frame: one glass tube bent round with smooth, generous curves, no corners.
  const r = Math.min(26, w / 4, h / 4);
  const e = 5;
  const glowRoom = neon ? 20 : 0;
  const frame = `M ${e + r} ${e} L ${w - e - r} ${e} C ${w - e - r * 0.45} ${e}, ${w - e} ${e + r * 0.45}, ${w - e} ${e + r} L ${w - e} ${h - e - r} C ${w - e} ${h - e - r * 0.45}, ${w - e - r * 0.45} ${h - e}, ${w - e - r} ${h - e} L ${e + r} ${h - e} C ${e + r * 0.45} ${h - e}, ${e} ${h - e - r * 0.45}, ${e} ${h - e - r} L ${e} ${e + r} C ${e} ${e + r * 0.45}, ${e + r * 0.45} ${e}, ${e + r} ${e} Z`;
  return (
    <View
      style={[
        styles.leaf,
        gate
          ? { paddingTop: arch * 0.7 + 14, paddingBottom: 16, paddingHorizontal: 16 }
          : floral
          ? { paddingTop: depth ? 26 : 40, paddingBottom: depth ? 14 : 18, paddingHorizontal: depth ? 14 : 18 }
          : { paddingVertical: neon ? 18 : pad, paddingHorizontal: neon ? 18 : Math.max(10, w * 0.08) },
      ]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - w) > 1 || Math.abs(height - h) > 1) setSize({ w: width, h: height });
      }}>
      {w ? (
        // A neon frame's glow spreads past the leaf's box, so its drawing gets room round the edge (nothing cut off).
        <Svg
          aria-hidden
          style={{ position: 'absolute', left: -glowRoom, top: -glowRoom }}
          width={w + glowRoom * 2}
          height={h + glowRoom * 2}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <G transform={`translate(${glowRoom} ${glowRoom})`}>
          {floral ? (
            <>
              <Path d={scallops(w, h, depth ? 7 : 9, depth ? 18 : 24)} fill={mix(look.leafSoft, look.leaf, 0.35)} stroke={mix(look.leaf, '#000000', 0.2)} strokeWidth={1.2} />
              <Path d={scallops(w, h, depth ? 12 : 15, depth ? 18 : 24)} fill="none" stroke={look.leaf} strokeOpacity={0.6} strokeWidth={0.8} />
              {depth ? (
                <>
                  <Path d={blossomPetals(w / 2, 9, 9)} fill={look.leaf} stroke={mix(look.leaf, '#000000', 0.25)} strokeWidth={0.7} />
                  <Circle cx={w / 2} cy={9} r={2.6} fill="#E8B84A" />
                </>
              ) : (
                <>
                  <Rose x={w / 2} y={16} r={15} petal={look.leaf} heart={mix(look.leaf, '#7A1E3A', 0.55)} />
                  <Path d={`${blossomPetals(16, h - 14, 8)} ${blossomPetals(w - 16, h - 14, 8, 0.6)}`} fill={mix(look.leaf, '#FFFFFF', 0.3)} stroke={mix(look.leaf, '#000000', 0.25)} strokeWidth={0.6} />
                </>
              )}
            </>
          ) : gate ? (
            <>
              {/* The doorway opens on the night sky, also where the page around it is light (a post's comments). */}
              <Path d={doorway(w, h, 2, arch)} fill={look.backdrop || '#0B1324'} fillOpacity={0.92} />
              <Rod d={doorway(w, h, 3, arch)} color={look.leaf} width={1.6} fine />
              <Path d={doorway(w, h, 9, arch - 4)} stroke={look.leaf} strokeOpacity={0.55} strokeWidth={0.8} fill="none" />
              <Path d={sparkle(w / 2, 3, 7)} fill="#FFFFFF" stroke={look.leaf} strokeWidth={0.8} />
            </>
          ) : neon ? (
            <>
              <Path d={frame} fill="#0B0820" fillOpacity={0.6} />
              <Rod d={frame} color={look.leaf} width={7} />
            </>
          ) : (
            <>
              <Path d={leaf} fill={look.leaf} stroke={ink || mix(look.leaf, '#000000', 0.3)} strokeWidth={ink ? 2 : 1.2} />
              <Path d={`M ${w / 2} 2 L ${w / 2} ${h - 4}`} stroke={ink || mix(look.leaf, look.stem, 0.6)} strokeOpacity={ink ? 0.9 : 0.7} strokeWidth={2} />
              <Path d={veins} stroke={ink || mix(look.leaf, look.stem, 0.5)} strokeOpacity={ink ? 0.8 : 0.55} strokeWidth={1.3} fill="none" />
            </>
          )}
          </G>
        </Svg>
      ) : null}
      {mark ? <View style={styles.mark}>{mark}</View> : null}
      {bare ? (
        children
      ) : (
        <View style={[styles.inner, { backgroundColor: highlighted ? colors.primarySoft : leafBox(look) }, ink ? { borderWidth: 1, borderColor: ink } : null]}>{children}</View>
      )}
    </View>
  );
}

/**
 * Fruit on the vine (Steve, 2026-10-30): someone has gifted the poster tokens, regular or
 * Priestly. Two round fruits hanging from a short stem, with a leaf.
 */
export function VineFruit({ label, size = 34 }: { label: string; size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 34 34">
        <Path d="M 17 2 C 17 7, 14 10, 11 15 M 17 2 C 18 8, 21 11, 24 16" stroke="#4A3220" strokeWidth={2} fill="none" strokeLinecap="round" />
        <Path d="M 17 4 Q 25 0, 30 5 Q 23 9, 17 4 Z" fill="#7FB347" stroke="#22301A" strokeWidth={1.2} />
        <Circle cx={11} cy={22} r={8} fill="#D9452B" stroke="#3A1A10" strokeWidth={1.6} />
        <Circle cx={24} cy={23} r={8} fill="#E8762E" stroke="#3A1A10" strokeWidth={1.6} />
        <Circle cx={8.5} cy={19} r={2.2} fill="#FFFFFF" fillOpacity={0.6} />
        <Circle cx={21.5} cy={20} r={2.2} fill="#FFFFFF" fillOpacity={0.6} />
      </Svg>
    </View>
  );
}

/** The feed card's box when it sits on a leaf (passed through CardSurface). */
export function leafCardSurface(look: VineLook): ViewStyle {
  const ink = look.vineStyle === 'ink' ? look.ink || '#3A2E1F' : '';
  return {
    backgroundColor: leafBox(look),
    borderColor: ink || (isLit(look.vineStyle) ? look.leaf : 'transparent'),
    borderRadius: look.vineStyle === 'neon' ? radius.lg : radius.md,
    padding: space.md,
  };
}

const styles = StyleSheet.create({
  row: { position: 'relative', overflow: 'visible' },
  reveal: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  spark: { position: 'absolute', top: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  sparkTail: { position: 'absolute', top: 0, width: 4, height: 22, borderRadius: 2, opacity: 0.45 },
  leaf: { position: 'relative' },
  inner: { padding: space.sm, borderRadius: radius.md },
  mark: { position: 'absolute', top: -10, alignSelf: 'center', zIndex: 1 },
});
