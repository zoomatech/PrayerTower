// The Beanstalk (Steve, 2026-10-30), redrawn to match the Claude Design video
// "Vine animation from claude design.mov": the vines, the drawing on screen and
// how it answers the scroll. A thick braided stalk of two twisting strands runs
// down the middle; each post sits in a frame wound with a leafy vine, a flower at
// its top. Above each post its comments hang off the stalk as real leaves (a
// rounded base on the stem, a pointed tip that droops, a midrib and side veins),
// three at a time: ‹ 1–3 of N › on the stalk swaps in the next three, which
// unfurl. Tapping a leaf with replies sprouts smaller reply leaves on their own
// stems, and a reply's replies one size smaller again (three levels, the first
// three at each). A leaf whose words are cut off grows into one big straight
// leaf in the middle of the screen with the whole comment and its replies;
// close it with the X or Esc. As each post scrolls into view its stalk grows up
// from the frame and its leaves unfurl. Reduced motion shows it all at once.
import { COMMENT_TEXT, type Card, type Comment } from '@prayer-tower/shared';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from '@/components/ui';
import { CardSurface } from '@/components/post-card';
import { VineFruit } from '@/components/vine-flow';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { space } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';
import { IdleBird, vineTokens } from './vine';

/** The drawing's palette, from the video. */
export const BEANSTALK = {
  backdrop: '#E9DFBF',
  cream: '#FCF4DC',
  ink: '#22301A',
  frameInk: '#2A1E14',
  strandDark: '#3F8A2C',
  strandLight: '#86C25A',
  leaf: '#A9D27B',
  leafPale: '#CFE6A6',
  vein: '#6E9F47',
  petal: '#F2C14E',
  heart: '#C0392B',
  // Darker than the video's blue, for 4.5:1 on the leaf (WCAG AA).
  link: '#23407F',
};
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

/** How many leaves hang at once, and how many replies show under each. */
export const PER_PAGE = 3;
/** Comment, reply, reply to a reply: the third level is the last. */
export const MAX_LEVEL = 2;

// ---------------------------------------------------------------------------
// Drawing helpers (exported for tests)

/** One strand of the braided stalk: whole turns per piece, so pieces meet where they join. */
export function braid(x: number, h: number, amp: number, phase: number) {
  const turns = Math.max(1, Math.round(h / 120));
  const pts: string[] = [];
  for (let y = 0; y < h; y += 5) pts.push(`${(x + amp * Math.sin((y / h) * turns * 2 * Math.PI + phase)).toFixed(1)} ${y}`);
  pts.push(`${(x + amp * Math.sin(turns * 2 * Math.PI + phase)).toFixed(1)} ${h}`);
  return `M ${pts.join(' L ')}`;
}

/**
 * A comment leaf in a W×H box, base on the left (on the stem), the tip on the
 * right drooping a little below the middle. `flip` mirrors it for the left side.
 */
export function leafShape(W: number, H: number, flip: boolean) {
  const X = (x: number) => (flip ? W - x * W : x * W).toFixed(1);
  const Y = (y: number) => (y * H).toFixed(1);
  const body = `M ${X(0.06)} ${Y(0.5)} C ${X(0.1)} ${Y(0.06)}, ${X(0.55)} ${Y(-0.04)}, ${X(0.8)} ${Y(0.24)} C ${X(0.92)} ${Y(0.36)}, ${X(0.98)} ${Y(0.5)}, ${X(1)} ${Y(0.64)} C ${X(0.9)} ${Y(0.8)}, ${X(0.74)} ${Y(0.98)}, ${X(0.45)} ${Y(0.95)} C ${X(0.2)} ${Y(0.92)}, ${X(0.03)} ${Y(0.76)}, ${X(0.06)} ${Y(0.5)} Z`;
  const stem = `M ${X(0)} ${Y(0.5)} L ${X(0.09)} ${Y(0.5)}`;
  const mid = (t: number) => {
    // Along the midrib, a quadratic from the base to the drooping tip.
    const u = 1 - t;
    return [u * u * 0.06 + 2 * u * t * 0.55 + t * t * 1, u * u * 0.5 + 2 * u * t * 0.44 + t * t * 0.64] as const;
  };
  const midrib = `M ${X(0.06)} ${Y(0.5)} Q ${X(0.55)} ${Y(0.44)}, ${X(1)} ${Y(0.64)}`;
  const veins = [0.2, 0.36, 0.52, 0.68, 0.82]
    .map((t) => {
      const [x, y] = mid(t);
      const reach = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.36;
      return `M ${X(x)} ${Y(y)} Q ${X(x + 0.05)} ${Y(y - reach * 0.5)}, ${X(x + 0.13)} ${Y(y - reach)} M ${X(x)} ${Y(y)} Q ${X(x + 0.05)} ${Y(y + reach * 0.5)}, ${X(x + 0.13)} ${Y(y + reach)}`;
    })
    .join(' ');
  return { body, stem, midrib, veins };
}

/** The big straight leaf of the reader: pointed at top and bottom, widest in the middle. */
export function bigLeaf(W: number, H: number) {
  return `M ${W / 2} 0 C ${W * 1.02} ${H * 0.12}, ${W * 1.02} ${H * 0.86}, ${W / 2} ${H} C ${W * -0.02} ${H * 0.86}, ${W * -0.02} ${H * 0.12}, ${W / 2} 0 Z`;
}

interface Edge {
  x: number;
  y: number;
  /** Outward normal. */
  nx: number;
  ny: number;
  /** Distance along the edge from the top middle. */
  s: number;
}

/** Points every `step` around a rounded rectangle, clockwise from the top middle. */
export function roundedRectEdge(x0: number, y0: number, w: number, h: number, r: number, step: number): Edge[] {
  const out: Edge[] = [];
  const segs: ((t: number) => Omit<Edge, 's'>)[] = [];
  const lens: number[] = [];
  const line = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
    segs.push((t) => ({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, nx, ny }));
    lens.push(Math.hypot(bx - ax, by - ay));
  };
  const arc = (cx: number, cy: number, a0: number) => {
    segs.push((t) => {
      const a = a0 + (t * Math.PI) / 2;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) };
    });
    lens.push((Math.PI * r) / 2);
  };
  const L = x0;
  const T = y0;
  const R = x0 + w;
  const B = y0 + h;
  line(x0 + w / 2, T, R - r, T, 0, -1);
  arc(R - r, T + r, -Math.PI / 2);
  line(R, T + r, R, B - r, 1, 0);
  arc(R - r, B - r, 0);
  line(R - r, B, L + r, B, 0, 1);
  arc(L + r, B - r, Math.PI / 2);
  line(L, B - r, L, T + r, -1, 0);
  arc(L + r, T + r, Math.PI);
  line(L + r, T, x0 + w / 2, T, 0, -1);
  const total = lens.reduce((a, b) => a + b, 0);
  for (let s = 0; s < total; s += step) {
    let rest = s;
    let i = 0;
    while (i < lens.length - 1 && rest > lens[i]!) rest -= lens[i++]!;
    out.push({ ...segs[i]!(lens[i] ? rest / lens[i]! : 0), s });
  }
  return out;
}

/** A small pointed leaf at (x, y), pointing along angle `a`. */
function sprigAt(x: number, y: number, a: number, len: number, wid: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const p = (u: number, v: number) => `${(x + u * c - v * s).toFixed(1)} ${(y + u * s + v * c).toFixed(1)}`;
  return `M ${p(0, 0)} Q ${p(len * 0.45, -wid)}, ${p(len, 0)} Q ${p(len * 0.45, wid)}, ${p(0, 0)} Z`;
}

/** A tendril curling away along angle `a`. */
function curlAt(x: number, y: number, a: number, size: number) {
  const pts: string[] = [];
  for (let t = 0; t <= 3.6 * Math.PI; t += 0.3) {
    const rr = size * (1 - t / (4.2 * Math.PI));
    const ang = a + t;
    pts.push(`${(x + Math.cos(a) * size + rr * Math.cos(ang + Math.PI)).toFixed(1)} ${(y + Math.sin(a) * size + rr * Math.sin(ang + Math.PI)).toFixed(1)}`);
  }
  return `M ${x} ${y} L ${pts.join(' L ')}`;
}

/** The vine wound round a post's frame: two strands, small leaves and curls. */
export function frameVine(w: number, h: number, pad: number) {
  const edge = roundedRectEdge(pad, pad, w - pad * 2, h - pad * 2, 22, 4);
  const strand = (sign: 1 | -1) =>
    'M ' + edge.map((e) => {
      const off = 1 + sign * 3.2 * Math.sin((e.s / 34) * 2 * Math.PI);
      return `${(e.x + e.nx * off).toFixed(1)} ${(e.y + e.ny * off).toFixed(1)}`;
    }).join(' L ') + ' Z';
  const leaves: string[] = [];
  const curls: string[] = [];
  edge.forEach((e, i) => {
    if (i % 8 === 4) {
      const a = Math.atan2(e.ny, e.nx) + (i % 16 === 4 ? 0.7 : -0.7);
      leaves.push(sprigAt(e.x + e.nx * 3, e.y + e.ny * 3, a, 14, 5.5));
    }
    if (i % 42 === 21) curls.push(curlAt(e.x + e.nx * 4, e.y + e.ny * 4, Math.atan2(e.ny, e.nx) + 0.4, 6));
  });
  return { a: strand(1), b: strand(-1), leaves: leaves.join(' '), curls: curls.join(' ') };
}

/** A five-petal flower centered on (x, y). */
function flower(x: number, y: number, r: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    return `M ${(x + Math.cos(a) * r * 0.9).toFixed(1)} ${(y + Math.sin(a) * r * 0.9).toFixed(1)} m ${-r * 0.55} 0 a ${r * 0.55} ${r * 0.55} 0 1 0 ${r * 1.1} 0 a ${r * 0.55} ${r * 0.55} 0 1 0 ${-r * 1.1} 0`;
  }).join(' ');
}

// ---------------------------------------------------------------------------
// Comments as leaves

/** Characters that fit on a leaf of width W at font size fs, over `lines` lines. */
export function leafChars(W: number, fs: number, lines: number) {
  return Math.max(12, Math.floor((W * 0.66) / (fs * 0.5)) * lines);
}

/** Cuts text to fit, at a word if it can, with "..". Returns the text and whether it was cut. */
export function fitText(text: string, max: number): { text: string; cut: boolean } {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return { text: t, cut: false };
  const head = t.slice(0, max - 2);
  const space = head.lastIndexOf(' ');
  return { text: `${(space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:]+$/, '')}..`, cut: true };
}

/** Top-level comments newest first, and each comment's replies in order. */
export function commentTree(all: Comment[]) {
  const top = all.filter((c) => !c.parentId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const kids = new Map<string, Comment[]>();
  for (const c of all) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c]);
  return { top, kids };
}

interface LeafRowItem {
  comment: Comment;
  level: number;
  side: 'left' | 'right';
}

/** The rows of one cluster, nearest the post first: each open leaf's first three replies follow it. */
export function clusterRows(page: Comment[], kids: Map<string, Comment[]>, open: Set<string>): LeafRowItem[] {
  const rows: LeafRowItem[] = [];
  const add = (c: Comment, level: number, side: 'left' | 'right') => {
    rows.push({ comment: c, level, side });
    if (level < MAX_LEVEL && open.has(c.id)) for (const r of (kids.get(c.id) ?? []).slice(0, PER_PAGE)) add(r, level + 1, side);
  };
  page.forEach((c, i) => add(c, 0, i % 2 === 0 ? 'left' : 'right'));
  return rows;
}

const LEVEL_SCALE = [1, 0.76, 0.6];

function leafSize(lane: number, level: number) {
  const W = Math.min(290, lane / 2 - 8) * LEVEL_SCALE[level]!;
  return { W, H: W * 0.5, fs: level === 0 ? (W > 220 ? 14 : 12.5) : level === 1 ? 11.5 : 10.5 };
}

const LeafRow = memo(function LeafRow({
  item,
  lane,
  replies,
  show,
  delay,
  onTap,
}: {
  item: LeafRowItem;
  lane: number;
  replies: number;
  show: boolean;
  delay: number;
  onTap: (c: Comment, cut: boolean) => void;
}) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!show) return;
    if (reduced) return grow.setValue(1);
    Animated.sequence([Animated.delay(delay), Animated.spring(grow, { toValue: 1, friction: 7, tension: 40, useNativeDriver: Platform.OS !== 'web' })]).start();
  }, [show, reduced, delay, grow]);

  const { W, H, fs } = leafSize(lane, item.level);
  const right = item.side === 'right';
  const cx = lane / 2;
  const out = right ? 1 : -1;
  const reach = 20 * item.level;
  const rowH = H * 0.78 + 4;
  const baseX = cx + out * reach;
  const shape = leafShape(W, H, !right);
  const lines = item.level === 0 ? 2 : 1;
  const fit = fitText(item.comment.body, leafChars(W, fs, lines));
  const label = fit.cut ? t('beanstalk.readMore') : replies ? t('beanstalk.replies', { count: replies }) : '';
  const actionable = fit.cut || (replies > 0 && item.level < MAX_LEVEL);
  const tilt = right ? '9deg' : '-9deg';
  const furl = right ? '-40deg' : '40deg';

  return (
    <View style={{ height: rowH }}>
      {item.level > 0 ? (
        // Its own stem, off the leaf it answers.
        <Svg aria-hidden pointerEvents="none" style={StyleSheet.absoluteFill} width={lane} height={rowH + 6} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d={`M ${cx + out * (reach - 14)} ${rowH + 6} C ${cx + out * (reach - 12)} ${rowH * 0.7}, ${baseX} ${rowH * 0.7}, ${baseX} ${rowH / 2}`} stroke={BEANSTALK.ink} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d={`M ${cx + out * (reach - 14)} ${rowH + 6} C ${cx + out * (reach - 12)} ${rowH * 0.7}, ${baseX} ${rowH * 0.7}, ${baseX} ${rowH / 2}`} stroke={BEANSTALK.strandDark} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      ) : null}
      <Animated.View
        style={[
          styles.leaf,
          {
            width: W,
            height: H,
            top: (rowH - H) / 2,
            left: right ? baseX - 2 : baseX - W + 2,
            opacity: grow,
            // It unfurls from its stem: the transform origin is the leaf's base.
            transform: [
              { translateX: (right ? -W : W) / 2 },
              { rotate: grow.interpolate({ inputRange: [0, 1], outputRange: [furl, tilt] }) },
              { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) },
              { translateX: (right ? W : -W) / 2 },
            ],
          },
        ]}>
        <Pressable
          disabled={!actionable}
          onPress={() => onTap(item.comment, fit.cut)}
          accessibilityRole={actionable ? 'button' : 'text'}
          accessibilityLabel={`${item.comment.author.displayName}: ${item.comment.body}`}
          accessibilityHint={fit.cut ? t('beanstalk.readHint') : actionable ? t('beanstalk.repliesHint') : undefined}
          style={StyleSheet.absoluteFill}>
          <Svg aria-hidden pointerEvents="none" width={W} height={H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Path d={shape.stem} stroke={BEANSTALK.ink} strokeWidth={4} strokeLinecap="round" />
            <Path d={shape.body} fill={item.level === 0 && item.side === 'left' ? BEANSTALK.leafPale : BEANSTALK.leaf} stroke={BEANSTALK.ink} strokeWidth={2.2} />
            <Path d={shape.midrib} stroke={BEANSTALK.vein} strokeWidth={1.6} fill="none" />
            <Path d={shape.veins} stroke={BEANSTALK.vein} strokeWidth={1.1} fill="none" />
          </Svg>
          <View style={[styles.leafText, { left: W * (right ? 0.2 : 0.12), width: W * 0.68 }]} pointerEvents="none">
            <Text style={[styles.leafName, { fontSize: fs }]} numberOfLines={1}>
              {item.comment.author.displayName}
            </Text>
            <Text style={[styles.leafBody, { fontSize: fs, lineHeight: fs * 1.25 }]} numberOfLines={lines}>
              {fit.text}
            </Text>
            {label ? <Text style={[styles.leafTap, { fontSize: fs * 0.85 }]}>{label}</Text> : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
});

/** ‹ 1–3 of N › on the stalk, just above the post. */
function Cycle({ page, total, onPage, show }: { page: number; total: number; onPage: (p: number) => void; show: boolean }) {
  const { t } = useLocale();
  const last = Math.ceil(total / PER_PAGE) - 1;
  const from = page * PER_PAGE + 1;
  const to = Math.min(total, from + PER_PAGE - 1);
  return (
    <View style={[styles.cycle, { opacity: show ? 1 : 0 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('beanstalk.prev')} disabled={page <= 0} onPress={() => onPage(page - 1)} style={[styles.cycleBtn, styles.cyclePrev, page <= 0 && styles.cycleOff]}>
        <Text style={styles.cycleArrow}>‹</Text>
      </Pressable>
      <View style={styles.cycleLabel}>
        <Text style={styles.cycleText}>{t('beanstalk.range', { from, to, total })}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('beanstalk.next')} disabled={page >= last} onPress={() => onPage(page + 1)} style={[styles.cycleBtn, styles.cycleNext, page >= last && styles.cycleOff]}>
        <Text style={styles.cycleArrow}>›</Text>
      </Pressable>
    </View>
  );
}

/** The braided stalk through one piece of the feed. It grows up from the post when first seen. */
function Stalk({ lane, h, show, sw }: { lane: number; h: number; show: boolean; sw: number }) {
  const reduced = useReducedMotion();
  const up = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (!show) return;
    if (reduced) return up.setValue(1);
    Animated.timing(up, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [show, reduced, up]);
  if (!lane || !h) return null;
  const cx = lane / 2;
  const amp = Math.max(4, sw * 0.42);
  const strandW = Math.max(4, sw * 0.62);
  const a = braid(cx, h, amp, 0);
  const b = braid(cx, h, amp, Math.PI);
  return (
    <Animated.View pointerEvents="none" style={[styles.stalk, { width: lane, height: up.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) }]}>
      <Svg aria-hidden width={lane} height={h} style={styles.stalkSvg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d={b} stroke={BEANSTALK.ink} strokeWidth={strandW + 3} fill="none" strokeLinecap="round" />
        <Path d={b} stroke={BEANSTALK.strandDark} strokeWidth={strandW} fill="none" strokeLinecap="round" />
        <Path d={a} stroke={BEANSTALK.ink} strokeWidth={strandW + 3} fill="none" strokeLinecap="round" />
        <Path d={a} stroke={BEANSTALK.strandLight} strokeWidth={strandW} fill="none" strokeLinecap="round" />
        <Path d={a} stroke="#C8E6A4" strokeOpacity={0.7} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/** A post in its vine-wound frame. */
function Framed({ fruit, children }: { fruit?: string; children: React.ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pad = 14;
  const vine = useMemo(() => (size.w ? frameVine(size.w + pad * 2, size.h + pad * 2, pad) : null), [size]);
  const surface = useMemo(() => ({ backgroundColor: BEANSTALK.cream, borderColor: BEANSTALK.frameInk, borderWidth: 3, borderRadius: 22, padding: space.md }), []);
  return (
    <View
      style={styles.framed}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
      }}>
      <CardSurface.Provider value={surface}>{children}</CardSurface.Provider>
      {vine ? (
        <Svg aria-hidden pointerEvents="none" style={[styles.frameSvg, { left: -pad, top: -pad }]} width={size.w + pad * 2} height={size.h + pad * 2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d={vine.leaves} fill={BEANSTALK.strandLight} stroke={BEANSTALK.ink} strokeWidth={1.3} />
          <Path d={vine.curls} stroke={BEANSTALK.strandDark} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Path d={vine.b} stroke={BEANSTALK.ink} strokeWidth={6} fill="none" />
          <Path d={vine.b} stroke={BEANSTALK.strandDark} strokeWidth={3.5} fill="none" />
          <Path d={vine.a} stroke={BEANSTALK.ink} strokeWidth={6} fill="none" />
          <Path d={vine.a} stroke={BEANSTALK.strandLight} strokeWidth={3.5} fill="none" />
          <Path d={flower((size.w + pad * 2) / 2, pad, 9)} fill={BEANSTALK.petal} stroke={BEANSTALK.ink} strokeWidth={1.2} />
          <Circle cx={(size.w + pad * 2) / 2} cy={pad} r={3.6} fill={BEANSTALK.heart} stroke={BEANSTALK.ink} strokeWidth={1} />
        </Svg>
      ) : null}
      {fruit ? (
        <View style={styles.fruit}>
          <VineFruit label={fruit} size={40} />
        </View>
      ) : null}
    </View>
  );
}

/** One long comment grown into a big straight leaf, with its replies and theirs. */
function Reader({ comment, kids, onClose }: { comment: Comment | null; kids: Map<string, Comment[]>; onClose: () => void }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(0)).current;
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!comment) return;
    grow.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.spring(grow, { toValue: 1, friction: 8, tension: 45, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [comment, reduced, grow]);
  useEffect(() => {
    if (!comment || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [comment, onClose]);
  const thread = (c: Comment, level: number): React.ReactNode =>
    (kids.get(c.id) ?? []).map((r) => (
      <View key={r.id} style={[styles.readerReply, { marginLeft: level * 14 }]}>
        <Text style={styles.readerName}>{r.author.displayName}</Text>
        <Text style={styles.readerBody}>{r.body}</Text>
        {level < MAX_LEVEL ? thread(r, level + 1) : null}
      </View>
    ));
  return (
    <Modal visible={!!comment} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.readerBack}>
        {comment ? (
          <Animated.View
            accessibilityViewIsModal
            style={[styles.reader, { opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}
            onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {box.w ? (
              <Svg aria-hidden pointerEvents="none" style={StyleSheet.absoluteFill} width={box.w} height={box.h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Path d={bigLeaf(box.w, box.h)} fill={BEANSTALK.leafPale} stroke={BEANSTALK.ink} strokeWidth={3} />
                <Path d={`M ${box.w / 2} 4 L ${box.w / 2} ${box.h - 4}`} stroke={BEANSTALK.vein} strokeOpacity={0.25} strokeWidth={2} />
              </Svg>
            ) : null}
            <ScrollView style={styles.readerScroll} contentContainerStyle={styles.readerInner}>
              <Text style={[styles.readerName, styles.readerLead]}>{comment.author.displayName}</Text>
              <Text style={styles.readerBody}>{comment.body}</Text>
              {thread(comment, 1)}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.readerClose}>
              <Text style={styles.readerX}>✕</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The feed

type Seen = { has: (id: string) => boolean; add: (id: string) => void; sub: (id: string, f: () => void) => () => void };
function makeSeen(): Seen {
  const ids = new Set<string>();
  const subs = new Map<string, Set<() => void>>();
  return {
    has: (id) => ids.has(id),
    add: (id) => {
      if (ids.has(id)) return;
      ids.add(id);
      subs.get(id)?.forEach((f) => f());
    },
    sub: (id, f) => {
      const set = subs.get(id) ?? new Set();
      set.add(f);
      subs.set(id, set);
      return () => set.delete(f);
    },
  };
}
function useSeen(store: Seen, id: string) {
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(() => store.has(id));
  useEffect(() => {
    if (store.has(id)) return setSeen(true);
    return store.sub(id, () => setSeen(true));
  }, [store, id]);
  return seen || reduced;
}

const Section = memo(function Section({ card, lane, seen: store, sw, renderCard }: { card: Card; lane: number; seen: Seen; sw: number; renderCard: FeedLayoutProps['renderCard'] }) {
  const { t } = useLocale();
  const seen = useSeen(store, card.id);
  const [all, setAll] = useState<Comment[] | null>(null);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState<Comment | null>(null);
  const [h, setH] = useState(0);
  const [fresh, setFresh] = useState(true);

  useEffect(() => {
    if (!seen || all || card.counts.comments <= 0) return;
    let live = true;
    api
      .comments(card.id)
      .then((r) => live && setAll(r.comments))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [seen, all, card.id, card.counts.comments]);

  // Until the comments arrive, the newest few the feed already sent.
  const fallback = useMemo(() => (card.leafComments ?? []).map((c) => ({ ...c, parentId: c.parentId ?? null })), [card.leafComments]);
  const { top, kids } = useMemo(() => commentTree(all ?? fallback), [all, fallback]);
  const total = all ? top.length : Math.max(top.length, card.counts.comments);
  const rows = useMemo(() => clusterRows(top.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE), kids, open), [top, kids, open, page]);

  const onTap = useCallback(
    (c: Comment, cut: boolean) => {
      setFresh(false);
      if (cut) return setReading(c);
      setOpen((o) => {
        const next = new Set(o);
        if (next.has(c.id)) {
          // Closing a leaf folds its replies' replies away too.
          const fold = (id: string) => {
            next.delete(id);
            for (const r of kids.get(id) ?? []) fold(r.id);
          };
          fold(c.id);
        } else next.add(c.id);
        return next;
      });
    },
    [kids],
  );
  const onPage = useCallback((p: number) => {
    setFresh(false);
    setOpen(new Set());
    setPage(p);
  }, []);
  const closeReader = useCallback(() => setReading(null), []);
  // Its comments show on the leaves, so the card doesn't repeat one.
  const shown = useMemo(() => (card.counts.comments > 0 ? { ...card, topComment: null } : card), [card]);

  return (
    <View style={styles.section} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <Stalk lane={lane} h={h} show={seen} sw={sw} />
      {/* Nearest the post first; the cluster climbs up the stalk. */}
      <View style={styles.cluster}>
        {rows.map((r, i) => (
          <LeafRow
            key={r.comment.id}
            item={r}
            lane={lane}
            replies={(kids.get(r.comment.id) ?? []).length}
            show={seen}
            // The first time, after the stalk has grown up past them; later, at once.
            delay={fresh ? 500 + i * 160 : i * 60}
            onTap={onTap}
          />
        ))}
      </View>
      {total > PER_PAGE ? <Cycle page={page} total={total} onPage={onPage} show={seen} /> : null}
      <Framed fruit={card.gifted ? t('vine.fruit') : undefined}>{renderCard(shown)}</Framed>
      <Reader comment={reading} kids={kids} onClose={closeReader} />
    </View>
  );
});

interface Verse {
  id: string;
  reference: string;
  text: string;
  translation: string | null;
}
type Item = { kind: 'post'; card: Card } | { kind: 'verse'; verse: Verse; key: string };

export function BeanstalkLayout({ cards, theme, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const tokens = useMemo(() => vineTokens(theme), [theme]);
  const { wording, t } = useLocale();
  const [lane, setLane] = useState(0);
  const seen = useRef(makeSeen()).current;
  const list = useRef<FlatList<Item>>(null);
  const [verses, setVerses] = useState<Verse[]>([]);
  const nudgeBird = useRef<() => void>(() => undefined);
  const registerBird = useCallback((nudge: () => void) => {
    nudgeBird.current = nudge;
  }, []);
  const lastScroll = useRef(0);

  // Open Circle members (neutral wording) see no scripture.
  useEffect(() => {
    if (wording === 'neutral') return setVerses([]);
    api
      .scriptureLeaves()
      .then((r) => setVerses(r.leaves))
      .catch(() => undefined);
  }, [wording]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    cards.forEach((card, i) => {
      out.push({ kind: 'post', card });
      if (verses.length && tokens.leafEvery > 0 && (i + 1) % tokens.leafEvery === 0) {
        const n = Math.floor(i / tokens.leafEvery);
        out.push({ kind: 'verse', verse: verses[n % verses.length]!, key: `verse-${n}` });
      }
    });
    return out;
  }, [cards, verses, tokens.leafEvery]);

  // Each post's stalk and leaves grow the first time it scrolls into view.
  const onViewable = useRef(({ viewableItems }: { viewableItems: { item?: unknown; isViewable: boolean }[] }) => {
    for (const v of viewableItems) if ((v.item as Item | null)?.kind === 'post') seen.add((v.item as { card: Card }).card.id);
  }).current;
  const viewability = useRef({ itemVisiblePercentThreshold: 8 }).current;

  const onScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScroll.current > 1000) {
      lastScroll.current = now;
      nudgeBird.current();
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === 'post' ? (
        <Section card={item.card} lane={lane} seen={seen} sw={tokens.stemWidth} renderCard={renderCard} />
      ) : (
        <View style={styles.section}>
          <Stalk lane={lane} h={160} show sw={tokens.stemWidth} />
          <View style={styles.verse} accessibilityRole="text">
            <Text style={styles.verseText}>“{item.verse.text}”</Text>
            <Text style={styles.verseRef}>
              {item.verse.reference}
              {item.verse.translation ? ` (${item.verse.translation})` : ''}
            </Text>
          </View>
        </View>
      ),
    [lane, seen, tokens.stemWidth, renderCard],
  );

  const banner = (
    <View style={styles.banner}>
      <Svg aria-hidden width={22} height={30} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M 9 30 C 9 20, 10 14, 14 9 C 18 4, 12 0, 8 3 C 5 6, 9 9, 11 7" stroke={BEANSTALK.strandDark} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Path d={sprigAt(9, 21, Math.PI * 1.15, 11, 4)} fill={BEANSTALK.strandLight} stroke={BEANSTALK.ink} strokeWidth={1} />
      </Svg>
      <View style={styles.bannerWords}>
        <Text style={styles.bannerTitle} accessibilityRole="header">
          {t('beanstalk.title')}
        </Text>
        <Text style={styles.bannerSub}>{t('beanstalk.subtitle')}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityHint={t('beanstalk.climbHint')} onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={styles.climb}>
        <Text style={styles.climbText}>{t('beanstalk.climb')}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.fill} onLayout={(e) => setLane(Math.min(e.nativeEvent.layout.width - space.md * 2, 760))}>
      {banner}
      <FlatList
        ref={list}
        data={items}
        keyExtractor={(it) => (it.kind === 'post' ? it.card.id : it.key)}
        renderItem={renderItem}
        extraData={lane}
        ListHeaderComponent={header ? <View style={styles.headerPanel}>{header}</View> : undefined}
        ListFooterComponent={
          atEnd && cards.length > 0 ? (
            <View style={styles.tip}>
              <Stalk lane={lane} h={60} show sw={tokens.stemWidth} />
              <View style={{ height: 60 }} />
              <Text style={styles.end}>{wording === 'neutral' ? t('vine.tip') : tokens.tipText}</Text>
              <Button small variant="ghost" label={t('vine.growMore')} onPress={onRefresh} />
            </View>
          ) : undefined
        }
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewability}
        {...feedListTuning}
        maxToRenderPerBatch={2}
        onScroll={onScroll}
        scrollEventThrottle={250}
      />
      {theme?.animations?.idleBird === false ? null : <IdleBird tokens={tokens} register={registerBird} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BEANSTALK.backdrop },
  content: { paddingHorizontal: space.md, paddingBottom: 120, alignItems: 'stretch', width: '100%', maxWidth: 760 + space.md * 2, alignSelf: 'center' },
  headerPanel: { borderRadius: 18, backgroundColor: BEANSTALK.cream, padding: space.sm, marginTop: space.md },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    backgroundColor: '#FDF5DE',
    borderBottomWidth: 4,
    borderBottomColor: BEANSTALK.frameInk,
  },
  bannerWords: { flex: 1 },
  bannerTitle: { fontFamily: SERIF, fontSize: 26, fontWeight: '700', color: BEANSTALK.frameInk },
  bannerSub: { fontFamily: SERIF, fontSize: 13, color: '#4A3A28' },
  climb: { backgroundColor: '#D7EBB4', borderWidth: 2, borderColor: BEANSTALK.frameInk, borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 6 },
  climbText: { fontFamily: SERIF, fontWeight: '700', color: BEANSTALK.frameInk },
  section: { paddingTop: 26, position: 'relative' },
  stalk: { position: 'absolute', left: 0, bottom: 0, overflow: 'hidden' },
  stalkSvg: { position: 'absolute', left: 0, bottom: 0 },
  cluster: { flexDirection: 'column-reverse', paddingBottom: 14 },
  leaf: { position: 'absolute' },
  leafText: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  leafName: { fontFamily: SERIF, fontWeight: '700', color: COMMENT_TEXT, textAlign: 'center' },
  leafBody: { fontFamily: SERIF, color: COMMENT_TEXT, textAlign: 'center' },
  leafTap: { fontFamily: SERIF, fontStyle: 'italic', fontWeight: '700', color: BEANSTALK.link, marginTop: 1 },
  cycle: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 8, zIndex: 2 },
  cycleBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#D7EBB4', borderWidth: 2.5, borderColor: BEANSTALK.frameInk },
  cyclePrev: { borderTopLeftRadius: 4, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  cycleNext: { borderTopLeftRadius: 18, borderTopRightRadius: 4, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  cycleOff: { opacity: 0.4 },
  cycleArrow: { fontSize: 22, fontWeight: '800', color: BEANSTALK.frameInk, marginTop: -3 },
  cycleLabel: { backgroundColor: '#FFF8E6', borderWidth: 2.5, borderColor: BEANSTALK.frameInk, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  cycleText: { fontFamily: SERIF, fontWeight: '700', color: BEANSTALK.frameInk },
  framed: { marginHorizontal: 14, marginVertical: 14, alignSelf: 'center', width: '92%', maxWidth: 600 },
  frameSvg: { position: 'absolute' },
  // Hangs off the frame's vine, by the top right corner.
  fruit: { position: 'absolute', top: -44, right: 20, zIndex: 3 },
  verse: { alignSelf: 'center', width: '70%', marginVertical: space.xl, padding: space.md, borderRadius: 18, borderWidth: 2.5, borderColor: BEANSTALK.frameInk, backgroundColor: BEANSTALK.cream, gap: 4 },
  verseText: { fontFamily: SERIF, fontSize: 15, lineHeight: 21, fontStyle: 'italic', color: COMMENT_TEXT },
  verseRef: { fontSize: 13, color: '#5A4A36' },
  tip: { alignItems: 'center', gap: space.sm, position: 'relative' },
  end: { fontSize: 13, color: '#4A3A28', textAlign: 'center', paddingHorizontal: space.xl },
  readerBack: { flex: 1, backgroundColor: 'rgba(24, 32, 14, 0.6)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  reader: { width: '100%', maxWidth: 520, height: '82%', maxHeight: 720 },
  readerScroll: { position: 'absolute', top: '27%', bottom: '20%', left: '19%', right: '19%' },
  readerInner: { gap: space.sm, paddingBottom: space.lg },
  readerLead: { fontSize: 17 },
  readerName: { fontFamily: SERIF, fontWeight: '700', color: COMMENT_TEXT, fontSize: 15 },
  readerBody: { fontFamily: SERIF, color: COMMENT_TEXT, fontSize: 15, lineHeight: 22 },
  readerReply: { borderLeftWidth: 3, borderLeftColor: BEANSTALK.strandDark, paddingLeft: space.sm, marginTop: space.sm, gap: 2 },
  readerClose: { position: 'absolute', top: '12%', right: '14%', width: 40, height: 40, borderRadius: 20, backgroundColor: BEANSTALK.cream, borderWidth: 2.5, borderColor: BEANSTALK.frameInk, alignItems: 'center', justifyContent: 'center' },
  readerX: { fontSize: 18, fontWeight: '800', color: BEANSTALK.frameInk },
});
