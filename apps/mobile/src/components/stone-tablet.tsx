// Drawn stonework for the Prayer Tower skin (Steve, 2026-10-29): the tower's
// two walls of dressed stone, a climber on a rope, battlements at the top, and
// the stone tablets each request is carved on, with smaller sub-tablets for
// its comments. All drawn with react-native-svg, original artwork. The text
// sits on a pale tablet face picked so card text keeps 4.5:1 (WCAG AA).
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';
import { memo, useState, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors, space } from '@/lib/theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function shade(a: string, b: string, t: number) {
  if (!HEX.test(a) || !HEX.test(b)) return a;
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return `#${[1, 3, 5].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** The smoothed face of a tablet, where the text is carved: pale stone that keeps every card text color at 4.5:1. */
export function tabletFace(stone: string) {
  for (const t of [0.72, 0.8, 0.88]) {
    const c = shade(stone, '#FFFFFF', t);
    if ([COMMENT_TEXT, colors.textMuted, colors.primary].every((text) => contrastRatio(c, text) >= 4.5)) return c;
  }
  return '#FBFAF7';
}

/** A small seeded random number, so each tablet keeps the same chisel marks. */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** The outline of a tablet: square at the foot, a rounded top, slightly uneven like cut stone. */
function slab(w: number, h: number, inset: number, r: number) {
  const l = inset;
  const t = inset;
  const ri = w - inset;
  const b = h - inset;
  return `M ${l} ${b} L ${l + 1} ${t + r} Q ${l} ${t}, ${l + r} ${t + 1} L ${ri - r} ${t} Q ${ri} ${t + 1}, ${ri - 1} ${t + r} L ${ri} ${b - 2} L ${ri - 3} ${b} Z`;
}

/**
 * A carved stone tablet. Depth 0 is a request; depth 1 and 2 are the smaller
 * sub-tablets of its comments and their replies.
 */
export function StoneTablet({ stone, mortar, depth = 0, seed = 1, children, testID }: { stone: string; mortar: string; depth?: number; seed?: number; children: ReactNode; testID?: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const { w, h } = size;
  const r = depth ? 12 : 26;
  const edge = depth ? 7 : 11;
  const marks = Array.from({ length: depth ? 3 : 6 }, (_, i) => {
    const x = rand(seed + i) * (w - 30) + 15;
    const y = rand(seed * 3 + i) < 0.5 ? edge / 2 + 2 : h - edge / 2 - 2;
    return `M ${x} ${y} l ${4 + rand(seed + i * 7) * 6} ${(rand(seed + i * 5) - 0.5) * 3}`;
  }).join(' ');
  const specks = Array.from({ length: depth ? 6 : 14 }, (_, i) => ({ x: rand(seed * 11 + i) * w, y: rand(seed * 13 + i) * h, r: 0.6 + rand(seed + i * 17) * 1.2 }));
  const inside: ViewStyle = { padding: edge + (depth ? 6 : 8), paddingTop: edge + (depth ? 8 : 14) };
  return (
    <View
      style={[styles.tablet, depth ? { marginTop: -2 } : null]}
      testID={testID}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - w) > 1 || Math.abs(height - h) > 1) setSize({ w: width, h: height });
      }}>
      {w ? (
        <Svg aria-hidden style={StyleSheet.absoluteFill} width={w} height={h} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* Its shadow on the wall behind, then the stone, a lit top-left bevel and a shaded bottom-right one. */}
          <Path d={slab(w, h, 0, r)} fill={shade(mortar, '#000000', 0.35)} fillOpacity={0.35} transform="translate(3 4)" />
          <Path d={slab(w, h, 1, r)} fill={stone} stroke={shade(mortar, '#000000', 0.2)} strokeWidth={1.5} />
          {specks.map((s, i) => (
            <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={shade(stone, '#000000', 0.3)} fillOpacity={0.35} />
          ))}
          <Path d={`M ${3} ${h - 4} L ${4} ${r + 2} Q ${3} ${3}, ${r + 2} ${4} L ${w - r - 2} ${3}`} stroke={shade(stone, '#FFFFFF', 0.55)} strokeWidth={2} fill="none" />
          <Path d={`M ${w - r - 2} ${3} Q ${w - 3} ${4}, ${w - 4} ${r + 2} L ${w - 3} ${h - 5} L ${4} ${h - 3}`} stroke={shade(stone, '#000000', 0.28)} strokeWidth={2} fill="none" />
          <Path d={marks} stroke={shade(stone, '#000000', 0.4)} strokeWidth={1} fill="none" />
          {/* The smoothed face where the words are carved. */}
          <Path d={slab(w, h, edge, Math.max(6, r - edge + 4))} fill={tabletFace(stone)} stroke={shade(stone, '#000000', 0.22)} strokeWidth={1} />
        </Svg>
      ) : null}
      <View style={inside}>{children}</View>
    </View>
  );
}

/** The card's own box when it is carved on a tablet: no box of its own, the tablet's face shows through. */
export function tabletCardSurface(stone: string): ViewStyle {
  return { backgroundColor: tabletFace(stone), borderColor: 'transparent', borderRadius: 4, padding: space.sm };
}

/** One course of stones per row, repeating every four rows so the wall can scroll seamlessly. */
const COURSES = [
  [0.62, 0.38],
  [0.3, 0.7],
  [1],
  [0.45, 0.55],
];

/** A wall of dressed stone: each stone shaded a little differently, with a lit top edge. Memoized: a few hundred shapes that only change with the skin, not with every scroll. */
export const StoneWall = memo(function StoneWall({ width, rows, course, stone, mortar }: { width: number; rows: number; course: number; stone: string; mortar: string }) {
  const rects: ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    let x = 0;
    for (const [k, f] of COURSES[row % COURSES.length]!.entries()) {
      const sw = f * width;
      const tone = shade(stone, rand(row * 7 + k) < 0.5 ? '#000000' : '#FFFFFF', rand(row * 3 + k) * 0.14);
      const y = row * course;
      rects.push(
        <Rect key={`${row}-${k}`} x={x + 0.75} y={y + 0.75} width={sw - 1.5} height={course - 1.5} rx={2} fill={tone} stroke={mortar} strokeWidth={1.5} />,
        <Path key={`${row}-${k}-l`} d={`M ${x + 2.5} ${y + 2.5} L ${x + sw - 3} ${y + 2.5}`} stroke={shade(tone, '#FFFFFF', 0.45)} strokeWidth={1.2} />,
      );
      x += sw;
    }
  }
  return (
    <Svg aria-hidden width={width} height={rows * course}>
      {rects}
    </Svg>
  );
});

/** Battlements along the top of the tower. */
export function Battlements({ width, stone, mortar }: { width: number; stone: string; mortar: string }) {
  const merlon = 34;
  const n = Math.max(3, Math.floor(width / merlon));
  const step = width / n;
  let d = `M 0 56 L 0 18`;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    d += ` L ${x} 0 L ${x + step * 0.6} 0 L ${x + step * 0.6} 18 L ${x + step} 18`;
  }
  d += ` L ${width} 56 Z`;
  return (
    <Svg aria-hidden width={width} height={56} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} fill={stone} stroke={mortar} strokeWidth={2} />
      <Path d={`M 0 38 L ${width} 38`} stroke={mortar} strokeWidth={1.5} />
    </Svg>
  );
}

/** A climber on a rope: arms up on the rope, feet braced on the wall. Drawn facing left, toward the tower. */
export function Climber({ jacket = '#B5452E', height = 64 }: { jacket?: string; height?: number }) {
  const s = height / 64;
  return (
    <Svg aria-hidden width={44 * s} height={height} viewBox="0 0 44 64" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Rope, running up off the top of the drawing. */}
      <Path d="M 26 0 L 26 64" stroke="#8A6A3D" strokeWidth={2} />
      {/* Arms reaching up to the rope. */}
      <Path d="M 22 24 L 25 12 M 28 24 L 27 8" stroke="#E2B48C" strokeWidth={3} strokeLinecap="round" />
      {/* Helmet and head. */}
      <Circle cx={22} cy={18} r={5} fill="#E2B48C" />
      <Path d="M 16.5 17 A 5.6 5.6 0 0 1 27.5 17 Z" fill="#F2C230" stroke="#9A7A12" strokeWidth={0.8} />
      {/* Jacket, harness and pack. */}
      <Path d="M 17 23 L 27 23 L 28 38 L 16 38 Z" fill={jacket} stroke={shade(jacket, '#000000', 0.35)} strokeWidth={1} />
      <Path d="M 16 34 L 28 34" stroke="#2E2A26" strokeWidth={2} />
      <Path d="M 27 25 L 32 26 L 32 35 L 28 35" fill="#5A6B4A" />
      {/* Legs bent, boots braced on the wall to the left. */}
      <Path d="M 19 38 L 10 44 L 6 52 M 25 38 L 18 48 L 6 58" stroke="#3C4A66" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M 3 50 L 7 50 L 7 54 L 3 54 Z M 3 56 L 7 56 L 7 60 L 3 60 Z" fill="#2E2A26" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  tablet: { position: 'relative' },
});
