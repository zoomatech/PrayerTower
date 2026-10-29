// The drawn vine (Steve, 2026-10-29): wide-spaced, curving vines that run top to
// bottom, present to past, with each post or comment housed inside a leaf.
// A row is one leaf hanging to one side; the vine runs in the gutter on the
// other side, swoops across the open space above the leaf to reach it, and a
// short leaf stalk joins it to the leaf's base. Rows draw their own piece of
// vine, starting where the row above ended, so together they make one plant.
// The vine is a transparent drawing (react-native-svg) behind the leaves.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, space } from '@/lib/theme';

export type VineSide = 'left' | 'right';

export interface VineLook {
  stem: string;
  leaf: string;
  leafSoft: string;
  tendril: string;
  stemWidth: number;
  stemDouble: boolean;
  stemGlow: boolean;
  backdrop: string;
}

/** Share of the row a leaf takes at each depth: comments, replies, replies to those. */
export const LEAF_WIDTH = [0.78, 0.7, 0.62] as const;
/** The vine's line, as a share of the row width, when the leaf hangs on each side. */
const vineX = (leafSide: VineSide | 'center', w: number) => (leafSide === 'left' ? w * 0.89 : leafSide === 'right' ? w * 0.11 : w / 2);

/** The open space above each leaf, where the vine crosses over. */
export const VINE_GAP = 56;

/**
 * The vine path for one row: from where the row above left off (`fromX`),
 * across the gap to this row's gutter, then down beside the leaf with a gentle
 * sway. Exported for tests.
 */
export function vinePath(fromX: number, toX: number, gap: number, height: number, sway: number) {
  const mid = gap + (height - gap) / 2;
  const d = (height - gap) / 4;
  // Every join is vertical, so the pieces from row to row meet without a kink.
  return [
    `M ${fromX} 0`,
    `C ${fromX} ${gap * 0.65}, ${toX} ${gap * 0.35}, ${toX} ${gap}`,
    `C ${toX} ${gap + d}, ${toX + sway} ${mid - d}, ${toX + sway} ${mid}`,
    `C ${toX + sway} ${mid + d}, ${toX} ${height - d}, ${toX} ${height}`,
  ].join(' ');
}

/** A tendril: a little spiral curling away from the vine. */
function curl(x: number, y: number, dir: 1 | -1) {
  const d = dir;
  return `M ${x} ${y} c ${10 * d} -2, ${20 * d} -12, ${16 * d} -20 c ${-3 * d} -6, ${-11 * d} -4, ${-10 * d} 2 c ${1 * d} 4, ${6 * d} 4, ${6 * d} 0`;
}

/** A small leaf on the vine itself, pointing outward. */
function sprig(x: number, y: number, dir: 1 | -1) {
  const d = dir;
  return `M ${x} ${y} q ${10 * d} -14, ${26 * d} -10 q ${-8 * d} 12, ${-26 * d} 10 z`;
}

/**
 * One row of the vine. `from` is the side the row above's leaf hung on (its
 * vine line), or null at the top. `side` is this leaf's side; 'center' keeps
 * the vine where it was (a verse or a scene between leaves).
 */
export function VineRow({
  from,
  side,
  look,
  gap = VINE_GAP,
  depth = 0,
  seed = 0,
  testID,
  children,
}: {
  from: VineSide | 'center' | null;
  side: VineSide | 'center';
  look: VineLook;
  gap?: number;
  depth?: number;
  seed?: number;
  testID?: string;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };
  // A verse keeps the vine on the line it was already on.
  const lineSide = side === 'center' ? (from ?? 'center') : side;
  const { w, h } = size;
  const toX = vineX(lineSide, w);
  const fromX = from === null ? toX : vineX(from, w);
  const sw = Math.max(1.5, look.stemWidth - depth);
  const out: 1 | -1 = lineSide === 'left' ? 1 : -1; // away from the leaf, toward the screen edge
  const leafEdge = side === 'left' ? w * LEAF_WIDTH[depth]! : w * (1 - LEAF_WIDTH[depth]!);
  const swayDir = seed % 2 === 0 ? 1 : -1;
  const path = w ? vinePath(fromX, toX, gap, h, 7 * swayDir) : '';
  // The leaf stalk: from the vine, a short curve up into the leaf's pointed base.
  const stalk = side === 'center' || !w ? '' : `M ${toX} ${gap + 34} Q ${(toX + leafEdge) / 2} ${gap + 30}, ${leafEdge - out * 2} ${gap + 6}`;
  const glowStroke = look.stemGlow ? <Path d={path} stroke={look.stem} strokeOpacity={0.25} strokeWidth={sw + 10} fill="none" strokeLinecap="round" /> : null;
  return (
    <View style={[styles.row, { paddingTop: gap }]} onLayout={onLayout} testID={testID}>
      {w ? (
        <Svg style={StyleSheet.absoluteFill} width={w} height={h} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {glowStroke}
          <Path d={path} stroke={look.stem} strokeWidth={look.stemDouble ? sw * 3 : sw} fill="none" strokeLinecap="round" />
          {look.stemDouble ? <Path d={path} stroke={look.backdrop || colors.background} strokeWidth={sw * 3 - 3} fill="none" strokeLinecap="round" /> : null}
          {stalk ? <Path d={stalk} stroke={look.stem} strokeWidth={Math.max(1.5, sw - 1)} fill="none" strokeLinecap="round" /> : null}
          {h - gap > 120 ? <Path d={curl(toX, gap + (h - gap) * 0.62, out)} stroke={look.tendril} strokeWidth={1.6} fill="none" strokeLinecap="round" /> : null}
          {from !== null && from !== lineSide ? <Path d={sprig(w / 2, gap / 2, swayDir)} fill={look.leaf} stroke={look.stem} strokeWidth={0.8} /> : null}
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A leaf that houses a post or a comment: square, with two pointed corners
 * (the base, by the vine, and the tip), a midrib between them, and the content
 * sitting inside on a soft panel.
 */
export function LeafFrame({
  side,
  look,
  depth = 0,
  highlighted = false,
  bare = false,
  mark,
  children,
}: {
  side: VineSide;
  look: VineLook;
  depth?: number;
  highlighted?: boolean;
  /** The content brings its own box (a feed card), so no soft panel. */
  bare?: boolean;
  mark?: ReactNode;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const left = side === 'left';
  const round = depth === 0 ? 44 : 32;
  // The base is the top corner nearest the vine; the tip is the opposite corner.
  const corners = left
    ? { borderTopRightRadius: 3, borderBottomLeftRadius: 3, borderTopLeftRadius: round, borderBottomRightRadius: round }
    : { borderTopLeftRadius: 3, borderBottomRightRadius: 3, borderTopRightRadius: round, borderBottomLeftRadius: round };
  const inset = round - 10;
  const innerCorners = left
    ? { borderTopRightRadius: 2, borderBottomLeftRadius: 2, borderTopLeftRadius: inset, borderBottomRightRadius: inset }
    : { borderTopLeftRadius: 2, borderBottomRightRadius: 2, borderTopRightRadius: inset, borderBottomLeftRadius: inset };
  const { w, h } = size;
  const rib = left ? `M ${w} 0 Q ${w * 0.45} ${h * 0.2}, 0 ${h}` : `M 0 0 Q ${w * 0.55} ${h * 0.2}, ${w} ${h}`;
  return (
    <View
      style={[styles.leaf, corners, { width: `${LEAF_WIDTH[depth]! * 100}%`, backgroundColor: look.leaf }, left ? styles.left : styles.right]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - w) > 1 || Math.abs(height - h) > 1) setSize({ w: width, h: height });
      }}>
      {w ? (
        <Svg style={StyleSheet.absoluteFill} width={w} height={h} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d={rib} stroke={look.stem} strokeOpacity={0.55} strokeWidth={2} fill="none" />
        </Svg>
      ) : null}
      {mark ? <View style={[styles.mark, left ? { right: -10 } : { left: -10 }]}>{mark}</View> : null}
      {bare ? children : <View style={[styles.inner, innerCorners, { backgroundColor: highlighted ? colors.primarySoft : look.leafSoft }]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: 'relative' },
  leaf: { padding: 12, position: 'relative' },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  inner: { padding: space.sm, overflow: 'hidden' },
  mark: { position: 'absolute', top: -8, zIndex: 1 },
});
