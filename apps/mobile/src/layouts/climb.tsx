// Mountain Climber (beta, behind Admin → Feed skins), Steve 2026-10-31. Drawn from the
// Claude Design canvas "Mountain Climber feed skin":
//   * The feed is a light brown and gray rock face, drawn as stone facets (no images).
//     The left edge of the screen is the edge of the rock wall, with sky beyond it.
//   * A Swiss climber, seen from the side, goes up and down that edge with you on a live
//     rope that never ends: taut above him, slack swinging below. Scroll up and he climbs
//     quickly up to where you stop, swinging his pickaxe; scroll down and he rappels
//     quickly down, kicking off the wall.
//   * Each post sits in a smoothed-out square of the rock wall.
//   * Its comments are text on rocks and jags below it. Tapping one zooms it up into a
//     full-screen stone box with a gradient, with its replies. The box sits lower than
//     the profile picture, name and first line of the request it answers (Steve).
// Reduced motion keeps the climber still on the rope.
// Buttons, comments and paging come from the shared skin hooks (docs/SKIN_HOOKS.md).
import type { Card, Comment, FeedTheme } from '@prayer-tower/shared';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

import { CardSurface } from '@/components/post-card';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { useFeedHooks } from '@/skins/feed-hooks';
import { usePostComments } from '@/skins/comments';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';

const DEFAULTS = { backdrop: '#B8AB96', slab: '#F1EBE0' };
type ClimbTokens = typeof DEFAULTS;

export function climbTokens(theme: FeedTheme | null): ClimbTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof t[k] === typeof v) out[k] = t[k];
  return out as ClimbTokens;
}

/** The cliff edge down the left (the wall's profile), and where the posts start to the right of it. */
export const EDGE_X = 54;
const GUTTER = 74;
/** How wide the strip the climber and his rope are drawn in is. */
const CLIMBER_W = 140;
/** How far down the screen he waits for you, as a share of its height. */
const ANCHOR = 0.38;
/** How much of the gap he closes each frame: high enough to look fast. */
const CATCH_UP = 0.16;

/** Light browns and grays for the stone facets. */
const FACETS = ['#C4B8A4', '#BAAD98', '#AFA28D', '#B4AFA5', '#A9A399', '#C9BFAE', '#BCB2A2', '#A89A84'];
/**
 * A comment rock's jagged outline in real points, so it is never stretched or squished
 * (Steve, 2026-10-31): a jag about every 28 points, 1 to 8 points deep, whatever the rock's size.
 */
export function rockOutline(w: number, h: number, seed: number): [number, number][] {
  const rnd = seeded(seed);
  const pts: [number, number][] = [];
  const side = (x0: number, y0: number, x1: number, y1: number, ox: number, oy: number) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 28));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const d = 1 + rnd() * 7;
      pts.push([x0 + (x1 - x0) * f + ox * d, y0 + (y1 - y0) * f + oy * d]);
    }
  };
  side(4, 0, w - 4, 0, 0, 1);
  side(w, 4, w, h - 4, -1, 0);
  side(w - 4, h, 4, h, 0, -1);
  side(0, h - 4, 0, 4, 1, 0);
  return pts;
}
/** Each post's square of rock has its own smoothed, slightly uneven corners. */
const CORNERS = [
  [22, 30, 18, 26],
  [28, 18, 30, 20],
  [18, 26, 24, 30],
  [30, 22, 20, 18],
] as const;
/** Replies shown in the close-up, two levels deep like every skin. */
const MAX_LEVEL = 2;

function seeded(seed: number) {
  let s = (seed * 7919 + 13) % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Stone facets for a band of rock w × h: a jittered grid whose top and bottom edges are straight, so bands meet in a ledge. */
export function rockFacets(w: number, h: number, seed: number) {
  const rnd = seeded(seed);
  const cols = Math.max(2, Math.round(w / 58));
  const rows = Math.max(1, Math.round(h / 44));
  const cw = w / cols;
  const ch = h / rows;
  const pts: { x: number; y: number }[][] = [];
  for (let i = 0; i <= cols; i++) {
    pts.push([]);
    for (let j = 0; j <= rows; j++) {
      const edgeX = i === 0 || i === cols;
      const edgeY = j === 0 || j === rows;
      pts[i]!.push({ x: i * cw + (edgeX ? 0 : (rnd() - 0.5) * cw * 0.5), y: j * ch + (edgeY ? 0 : (rnd() - 0.5) * ch * 0.55) });
    }
  }
  const facets: { points: string; fill: string }[] = [];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const a = pts[i]![j]!;
      const b = pts[i + 1]![j]!;
      const c = pts[i + 1]![j + 1]!;
      const d = pts[i]![j + 1]!;
      const p = (q: { x: number; y: number }) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
      // Some cells break into two stones along a diagonal.
      if (rnd() < 0.4) {
        facets.push({ points: [a, b, c].map(p).join(' '), fill: FACETS[Math.floor(rnd() * FACETS.length)]! });
        facets.push({ points: [a, c, d].map(p).join(' '), fill: FACETS[Math.floor(rnd() * FACETS.length)]! });
      } else facets.push({ points: [a, b, c, d].map(p).join(' '), fill: FACETS[Math.floor(rnd() * FACETS.length)]! });
    }
  const cracks: string[] = [];
  for (let k = 0; k < Math.max(1, Math.round(h / 260)); k++) {
    let x = 10 + rnd() * (w - 20);
    let y = 20 + rnd() * Math.max(h - 120, 10);
    let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const dir = rnd() < 0.5 ? -1 : 1;
    for (let n = 0, steps = 4 + Math.floor(rnd() * 4); n < steps; n++) {
      x += dir * (8 + rnd() * 22);
      y += 6 + rnd() * 20;
      d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    cracks.push(d);
  }
  return { facets, cracks };
}

const SKY = '#D9E3E8';

/** The cliff edge for a band h tall: jagged, but at EDGE_X at its top and bottom so bands join. */
export function cliffEdge(h: number, seed: number) {
  const rnd = seeded(seed + 101);
  const pts: { x: number; y: number }[] = [{ x: EDGE_X, y: 0 }];
  for (let y = 22; y < h - 11; y += 22) pts.push({ x: EDGE_X + (rnd() - 0.5) * 10 + (rnd() < 0.12 ? 6 : 0), y });
  pts.push({ x: EDGE_X, y: h });
  const line = pts.map((q) => `${q.x.toFixed(1)} ${q.y}`).join(' L');
  return { edge: `M${line}`, sky: `M0 0 L${line} L0 ${h} Z` };
}

/** A band of the rock face, with the cliff edge down its left side. */
const RockBand = memo(function RockBand({ w, h, seed, tokens }: { w: number; h: number; seed: number; tokens: ClimbTokens }) {
  const { facets, cracks } = useMemo(() => rockFacets(w, h, seed), [w, h, seed]);
  const { edge, sky } = useMemo(() => cliffEdge(h, seed), [h, seed]);
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Rect x={0} y={0} width={w} height={h} fill={tokens.backdrop} />
      {facets.map((f, i) => (
        <Polygon key={i} points={f.points} fill={f.fill} stroke="rgba(80,66,50,0.32)" strokeWidth={1} strokeLinejoin="round" />
      ))}
      {cracks.map((d, i) => (
        <G key={`c${i}`}>
          <Path d={d} fill="none" stroke="rgba(255,250,240,0.4)" strokeWidth={1.4} transform="translate(1 1.2)" />
          <Path d={d} fill="none" stroke="#5F5446" strokeWidth={1.6} strokeLinejoin="round" opacity={0.7} />
        </G>
      ))}
      {/* The ledge where this band of rock meets the one above. */}
      <Line x1={0} y1={0.5} x2={w} y2={0.5} stroke="rgba(70,56,42,0.45)" strokeWidth={1.5} />
      <Line x1={0} y1={2} x2={w} y2={2} stroke="rgba(255,250,240,0.35)" strokeWidth={1} />
      {/* Sky beyond the cliff edge, then the edge itself: a dark rim with the wall's side in shadow. */}
      <Path d={sky} fill={SKY} />
      <Path d={edge} fill="none" stroke="#7B6C59" strokeWidth={7} strokeLinejoin="round" opacity={0.55} transform="translate(3 0)" />
      <Path d={edge} fill="none" stroke="#4F4436" strokeWidth={2.4} strokeLinejoin="round" />
    </Svg>
  );
});

/** A stretch of rock face that sizes itself to what's on it. */
function Band({ seed, tokens, minHeight, children, testID }: { seed: number; tokens: ClimbTokens; minHeight?: number; children?: React.ReactNode; testID?: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={[styles.band, minHeight ? { minHeight } : null]}
      testID={testID}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: Math.round(width), h: Math.round(height) });
      }}>
      {size.w ? <RockBand w={size.w} h={size.h} seed={seed} tokens={tokens} /> : null}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The climber.

type Mode = 'up' | 'down' | 'still';
/**
 * His pose from the side, facing the wall on his right. Angles are degrees; arms turn with
 * his lean. `off` is how far his harness hangs out from the cliff edge.
 */
export interface Pose { lean: number; off: number; axeInHand: boolean; nearArm: number; farArm: number; nearHip: number; nearKnee: number; farHip: number; farKnee: number }

/** Climbing up (pickaxe swinging, legs stepping), rappelling down (leaning back, kicking off the wall), or hanging still. */
export function climberPose(mode: Mode, p: number, t: number): Pose {
  if (mode === 'up') {
    const s = Math.sin(p);
    return { lean: 6, off: 10, axeInHand: true, nearArm: -150 - 20 * s, farArm: -150 + 20 * s, nearHip: -62 + 24 * s, nearKnee: 82 - 24 * s, farHip: -62 - 24 * s, farKnee: 82 + 24 * s };
  }
  if (mode === 'down') {
    const out = Math.abs(Math.sin(p * 0.55));
    return { lean: -38 + 6 * out, off: 23 + 13 * out, axeInHand: false, nearArm: -125, farArm: 75, nearHip: -88 + 18 * out, nearKnee: 8 + 60 * out, farHip: -80 + 18 * out, farKnee: 14 + 60 * out };
  }
  return { lean: -18 + 2 * Math.sin(t * 1.3), off: 19, axeInHand: false, nearArm: -150, farArm: 55, nearHip: -76, nearKnee: 32, farHip: -68, farKnee: 40 };
}

/** Where his near hand is, relative to his harness, so the rope above can run through it. */
export function nearHand(pose: Pose) {
  const lean = (pose.lean * Math.PI) / 180;
  const a = ((pose.lean + pose.nearArm) * Math.PI) / 180;
  return { x: 2 * Math.cos(lean) + 27 * Math.sin(lean) - 21 * Math.sin(a), y: 2 * Math.sin(lean) - 27 * Math.cos(lean) + 21 * Math.cos(a) };
}

/** The rope: taut from above (through his hand unless he is climbing), and the slack below swinging and trailing behind fast moves. */
export function ropePaths(pose: Pose, mode: Mode, hx: number, hy: number, bottom: number, t: number, vel: number) {
  const top = EDGE_X - 8;
  const hand = nearHand(pose);
  const above =
    mode === 'up'
      ? `M${top} -20 L${(hx + 1).toFixed(1)} ${(hy - 1).toFixed(1)}`
      : `M${top} -20 L${(hx + hand.x).toFixed(1)} ${(hy + hand.y).toFixed(1)} L${(hx + 1).toFixed(1)} ${(hy - 1).toFixed(1)}`;
  const sw = 6 * Math.sin(t * 1.7) - vel * 2.2;
  const sw2 = 9 * Math.sin(t * 1.7 - 0.8) - vel * 4;
  const below =
    `M${hx.toFixed(1)} ${hy.toFixed(1)} C${(hx - 4 + sw).toFixed(1)} ${(hy + 60).toFixed(1)}, ${(hx - 10 + sw2).toFixed(1)} ${(hy + 170).toFixed(1)}, ${(hx - 6).toFixed(1)} ${(hy + 300).toFixed(1)}` +
    ` L${(hx - 6).toFixed(1)} ${Math.max(bottom + 20, hy + 320)}`;
  return { above, below };
}

function Rope({ d }: { d: string }) {
  return (
    <>
      <Path d={d} fill="none" stroke="#7A2412" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} fill="none" stroke="#E0552A" strokeWidth={2.2} strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/** The Swiss climber from the side: red shirt, pack with the white cross, alpine hat with a feather, pickaxe. Drawn round his harness at 0,0. */
function ClimberDrawing({ pose }: { pose: Pose }) {
  const leg = (hip: number, knee: number, thigh: string, sock: string, boot: string) => (
    <G transform={`rotate(${hip.toFixed(1)})`}>
      <Path d="M0 0 L0 13" stroke={thigh} strokeWidth={7.5} strokeLinecap="round" />
      <G transform={`translate(0 13) rotate(${knee.toFixed(1)})`}>
        <Path d="M0 0 L0 10" stroke={sock} strokeWidth={5.5} strokeLinecap="round" />
        <Path d="M-4 9 L7.5 9 L7.5 14 L-4 14 Z" fill={boot} />
      </G>
    </G>
  );
  const axe = (
    <>
      <Path d="M0 17 L0 38" stroke="#7A5532" strokeWidth={2.6} strokeLinecap="round" />
      <Path d="M-2 36 Q6 34.5 13 40 L12 42.5 Q6 38.5 -2 39.5 Z" fill="#9AA3AA" stroke="#4B5257" strokeWidth={1} />
      <Path d="M-2 36 L-8 35 L-8 39 L-2 39.5 Z" fill="#9AA3AA" stroke="#4B5257" strokeWidth={1} />
    </>
  );
  return (
    <>
      {leg(pose.farHip, pose.farKnee, '#4A443C', '#9A0C22', '#1F1810')}
      <G transform={`rotate(${pose.lean.toFixed(1)})`}>
        <G transform={`translate(1 -27) rotate(${pose.farArm.toFixed(1)})`}>
          <Path d="M0 0 L0 18" stroke="#9A0C22" strokeWidth={5.5} strokeLinecap="round" />
          <Circle cx={0} cy={20.5} r={3.2} fill="#C99573" />
        </G>
        <Rect x={-15} y={-31} width={10} height={22} rx={3.5} fill="#9A0C22" />
        <Rect x={-11.1} y={-24.5} width={2.4} height={8.5} fill="#FFFFFF" />
        <Rect x={-14.1} y={-21.5} width={8.4} height={2.4} fill="#FFFFFF" />
        {/* The pickaxe rides on his pack while he rappels or hangs. */}
        {pose.axeInHand ? null : (
          <G transform="translate(-13 -30) rotate(-18)">
            <Path d="M0 0 L0 22" stroke="#7A5532" strokeWidth={2.2} strokeLinecap="round" />
            <Path d="M-7 -1 Q0 -4 8 1 L7 3 Q0 0 -7 2 Z" fill="#9AA3AA" stroke="#4B5257" strokeWidth={0.8} />
          </G>
        )}
        <Rect x={-7} y={-32} width={14} height={33} rx={6} fill="#C8102E" />
        <Rect x={-8} y={-3} width={16} height={4.5} rx={1.5} fill="#33302B" />
        <Circle cx={0} cy={-40} r={7} fill="#6B4A2B" />
        <Circle cx={3} cy={-39} r={5.6} fill="#E3B08A" />
        <Circle cx={8.4} cy={-39} r={1.5} fill="#E3B08A" />
        <Ellipse cx={1} cy={-45} rx={11} ry={2.4} fill="#3D5A2A" />
        <Path d="M-5 -45 Q-5 -54 2 -54 Q8 -54 7 -45 Z" fill="#4B6B33" />
        <Rect x={-5} y={-47.6} width={12} height={2} fill="#C8102E" />
        <Path d="M-4 -48 Q-12 -57 -10 -64" fill="none" stroke="#F1E9DB" strokeWidth={1.6} strokeLinecap="round" />
        <G transform={`translate(2 -27) rotate(${pose.nearArm.toFixed(1)})`}>
          {pose.axeInHand ? axe : null}
          <Path d="M0 0 L0 19" stroke="#C8102E" strokeWidth={6} strokeLinecap="round" />
          <Circle cx={0} cy={21.5} r={3.6} fill="#E3B08A" />
        </G>
      </G>
      {leg(pose.nearHip, pose.nearKnee, '#5C544A', '#C8102E', '#2B2118')}
      <Circle cx={0} cy={-0.5} r={2.6} fill="none" stroke="#E05A2A" strokeWidth={1.8} />
    </>
  );
}

/** One step of the chase: where he is now on the wall, and whether he is climbing, rappelling or still. */
export function chaseStep(y: number, target: number, k = CATCH_UP) {
  const dy = target - y;
  const step = Math.abs(dy) < 0.6 ? dy : dy * k;
  const mode: Mode = step < -0.7 ? 'up' : step > 0.7 ? 'down' : 'still';
  return { y: y + step, step, mode };
}

/**
 * The climber and his rope, over the cliff edge. He lives on the wall (content position `y`)
 * and chases the spot `anchor` down the screen: scroll up and he climbs to it, scroll down
 * and he rappels to it.
 */
function Climber({ scroll, anchor, height, reduced }: { scroll: React.MutableRefObject<number>; anchor: number; height: number; reduced: boolean }) {
  const [frame, setFrame] = useState({ top: anchor, x: EDGE_X - 19, mode: 'still' as Mode, p: 0, t: 0, vel: 0 });
  useEffect(() => {
    if (reduced || !anchor) {
      setFrame({ top: anchor, x: EDGE_X - 19, mode: 'still', p: 0, t: 0, vel: 0 });
      return;
    }
    let y = scroll.current + anchor;
    let x = EDGE_X - 19;
    let p = 0;
    let t = 0;
    let vel = 0;
    let n = 0;
    let raf = 0;
    const tick = () => {
      const s = chaseStep(y, scroll.current + anchor);
      y = s.y;
      p += Math.abs(s.step) / 11;
      t += 1 / 60;
      vel = vel * 0.85 + s.step * 0.15;
      x += (EDGE_X - climberPose(s.mode, p, t).off - x) * 0.25;
      n++;
      // Still, he only sways and his rope swings: a third of the frames is plenty.
      if (s.mode !== 'still' || n % 3 === 0) setFrame({ top: y - scroll.current, x, mode: s.mode, p, t, vel });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scroll, anchor, reduced]);
  const pose = climberPose(frame.mode, frame.p, frame.t);
  const rope = ropePaths(pose, frame.mode, frame.x, frame.top, height, frame.t, frame.vel);
  return (
    <View pointerEvents="none" style={[styles.climber, { height }]} testID={`climber-${frame.mode}`}>
      <Svg width={CLIMBER_W} height={height} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Rope d={rope.above} />
        <Rope d={rope.below} />
        <G transform={`translate(${frame.x.toFixed(1)} ${frame.top.toFixed(1)})`}>
          <ClimberDrawing pose={pose} />
        </G>
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Comments: text on rocks and jags below the post.

function Rock({ comment, shape, left, onOpen }: { comment: Comment; shape: number; left: boolean; onOpen: () => void }) {
  const { t } = useLocale();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const outline = useMemo(() => rockOutline(box.w, box.h, shape + 1), [box.w, box.h, shape]);
  const pts = (dx: number, dy: number) => outline.map(([x, y]) => `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`).join(' ');
  const id = `rock-${comment.id}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${comment.author.displayName}: ${comment.body}`}
      accessibilityHint={t('climb.openComment')}
      onPress={onOpen}
      style={[styles.rock, left ? styles.rockLeft : styles.rockRight]}
      testID={id}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1) setBox({ w: width, h: height });
      }}>
      {box.w ? (
        <Svg width={box.w} height={box.h + 6} style={styles.rockArt} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Defs>
            <LinearGradient id={`${id}-g`} x1="0" y1="0" x2="0.25" y2="1">
              <Stop offset="0" stopColor="#D6CCBA" />
              <Stop offset="0.6" stopColor="#B9AD98" />
              <Stop offset="1" stopColor="#A59882" />
            </LinearGradient>
          </Defs>
          {/* Its shadow on the wall, then the rock, with a lit top edge. */}
          <Polygon points={pts(0, 4)} fill="rgba(40,30,20,0.45)" />
          <Polygon points={pts(0, 0)} fill={`url(#${id}-g)`} stroke="rgba(60,48,36,0.55)" strokeWidth={1} strokeLinejoin="round" />
        </Svg>
      ) : null}
      <Text style={styles.rockName} numberOfLines={1}>
        {comment.author.displayName}
      </Text>
      <Text style={styles.rockText} numberOfLines={2}>
        {comment.body}
      </Text>
    </Pressable>
  );
}

/** How many comments sit on rocks under a post; the rest open with the post. */
const ROCKS_SHOWN = 3;

function CommentRocks({ card, index, onOpen }: { card: Card; index: number; onOpen: (card: Card, c: Comment, kids: Map<string, Comment[]>) => void }) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const { top, kids, total } = usePostComments(card);
  if (!top.length) return null;
  const more = total - Math.min(top.length, ROCKS_SHOWN);
  return (
    <View style={styles.rocks}>
      {top.slice(0, ROCKS_SHOWN).map((c, i) => (
        <Rock key={c.id} comment={c} shape={index * 2 + i} left={(index + i) % 2 === 0} onOpen={() => onOpen(card, c, kids)} />
      ))}
      {more > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => openPost(card.id)} style={styles.pebble}>
          <Text style={styles.pebbleText}>{t('climb.more', { n: more })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The top of the request a comment answers: the poster's picture (initials until they add one), name and the first line. */
function Parent({ card }: { card: Card }) {
  const name = card.author.displayName;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <View style={styles.parent} testID="climb-parent">
      <View style={styles.parentHead}>
        <View style={styles.oval}>
          {card.author.photoUrl ? <Image source={{ uri: card.author.photoUrl }} style={styles.ovalPhoto} accessibilityIgnoresInvertColors /> : <Text style={styles.ovalText}>{initials}</Text>}
        </View>
        <Text style={styles.bigName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={styles.parentLine} numberOfLines={1}>
        {card.body}
      </Text>
    </View>
  );
}

/** A comment zoomed up to full screen in a stone box with a gradient, with its replies. */
function CloseUp({ card, comment, kids, onClose }: { card: Card | null; comment: Comment | null; kids: Map<string, Comment[]>; onClose: () => void }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(0)).current;
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!comment) return;
    grow.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(grow, { toValue: 1, duration: 450, easing: Easing.bezier(0.25, 1.2, 0.5, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [comment, reduced, grow]);
  useEffect(() => {
    if (!comment || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [comment, onClose]);
  const thread = (c: Comment, level: number): React.ReactNode =>
    (kids.get(c.id) ?? []).map((r) => (
      <View key={r.id} style={styles.reply}>
        <Text style={styles.bigName}>{r.author.displayName}</Text>
        <Text style={styles.replyText}>{r.body}</Text>
        {level < MAX_LEVEL ? thread(r, level + 1) : null}
      </View>
    ));
  return (
    <Modal visible={!!comment} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.close')} />
      {comment && card ? (
        <View style={styles.bigColumn} pointerEvents="box-none" accessibilityViewIsModal>
        {/* The request it answers stays showing above the box: picture, name and first line. */}
        <Parent card={card} />
        <Animated.View
          testID="climb-closeup"
          style={[
            styles.big,
            {
              opacity: grow,
              transform: [{ rotate: grow.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '0deg'] }) }, { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 1] }) }],
            },
          ]}
          onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {box.w ? (
            <Svg width={box.w} height={box.h} style={StyleSheet.absoluteFill} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Defs>
                <LinearGradient id="climb-big" x1="0" y1="0" x2="0.35" y2="1">
                  <Stop offset="0" stopColor="#F4EEE3" />
                  <Stop offset="0.45" stopColor="#E4D9C6" />
                  <Stop offset="1" stopColor="#C9BBA3" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={box.w} height={box.h} fill="url(#climb-big)" />
            </Svg>
          ) : null}
          <ScrollView contentContainerStyle={styles.bigInner}>
            <Text style={styles.bigName}>{comment.author.displayName}</Text>
            <Text style={styles.bigText}>{comment.body}</Text>
            {thread(comment, 1)}
          </ScrollView>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.close}>
            <Svg width={18} height={18} aria-hidden>
              <Path d="M3 3 L 15 15 M15 3 L 3 15" stroke="#2B241C" strokeWidth={3} strokeLinecap="round" />
            </Svg>
          </Pressable>
        </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const PostBand = memo(function PostBand({
  card,
  index,
  tokens,
  pinned,
  renderCard,
  onOpen,
}: {
  card: Card;
  index: number;
  tokens: ClimbTokens;
  pinned: boolean;
  renderCard: FeedLayoutProps['renderCard'];
  onOpen: (card: Card, c: Comment, kids: Map<string, Comment[]>) => void;
}) {
  const { t } = useLocale();
  const [tl, tr, br, bl] = CORNERS[index % CORNERS.length]!;
  // The post's smoothed-out square of the rock wall.
  const slab = useMemo(
    () => ({ ...styles.slab, backgroundColor: tokens.slab, borderTopLeftRadius: tl, borderTopRightRadius: tr, borderBottomRightRadius: br, borderBottomLeftRadius: bl }),
    [tokens.slab, tl, tr, br, bl],
  );
  return (
    <Band seed={index + 1} tokens={tokens} testID={`climb-${card.id}`}>
      <View style={styles.post}>
        {pinned ? <Text style={styles.pinned}>{t('feed.pinned')}</Text> : null}
        <CardSurface.Provider value={slab}>{renderCard(card.counts.comments > 0 ? { ...card, topComment: null } : card)}</CardSurface.Provider>
        <CommentRocks card={card} index={index} onOpen={onOpen} />
      </View>
    </Band>
  );
});

export function ClimbLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => climbTokens(theme), [theme]);
  const reduced = useReducedMotion();
  const scroll = useRef(0);
  const [height, setHeight] = useState(0);
  const [reading, setReading] = useState<{ card: Card; comment: Comment; kids: Map<string, Comment[]> } | null>(null);
  const onOpen = useMemo(() => (card: Card, comment: Comment, kids: Map<string, Comment[]>) => setReading({ card, comment, kids }), []);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scroll.current = e.nativeEvent.contentOffset.y;
  };
  return (
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="climb-layout" onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => <PostBand card={item} index={index} tokens={tokens} pinned={item.id === pinnedId} renderCard={renderCard} onOpen={onOpen} />}
        ListHeaderComponent={
          <Band seed={0} tokens={tokens} minHeight={44}>
            {header ? <View style={styles.header}>{header}</View> : null}
          </Band>
        }
        // The rope never ends: it runs on down past the last post.
        ListFooterComponent={
          <Band seed={cards.length + 1} tokens={tokens} minHeight={Math.max(height * 0.7, 260)}>
            {atEnd && cards.length > 0 ? <Text style={styles.end}>{t('climb.end')}</Text> : null}
          </Band>
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        {...feedListTuning}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      {height ? <Climber scroll={scroll} anchor={Math.round(height * ANCHOR)} height={height} reduced={reduced} /> : null}
      <CloseUp card={reading?.card ?? null} comment={reading?.comment ?? null} kids={reading?.kids ?? new Map()} onClose={() => setReading(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  band: { position: 'relative', overflow: 'hidden' },
  header: { paddingLeft: GUTTER, paddingRight: 12, paddingTop: 12 },
  post: { paddingLeft: GUTTER, paddingRight: 12, paddingTop: 22, paddingBottom: 26, gap: 10 },
  pinned: { fontWeight: '700', fontSize: 13, color: '#2B241C' },
  // Carved and smoothed: a lit top edge, a darker lower edge, and a shadow on the wall.
  slab: {
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.6)',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(90,70,45,0.35)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: 'rgba(90,70,45,0.25)',
    borderRightColor: 'rgba(90,70,45,0.25)',
    shadowColor: '#2D2319',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  rocks: { gap: 8 },
  rock: { width: '78%', maxWidth: 360, paddingVertical: 16, paddingLeft: 22, paddingRight: 24, minHeight: 64 },
  rockLeft: { alignSelf: 'flex-start', marginLeft: 4 },
  rockRight: { alignSelf: 'flex-end', marginRight: 0 },
  rockArt: { position: 'absolute', left: 0, top: 0 },
  rockName: { fontWeight: '700', fontSize: 13, color: '#3A2F23' },
  rockText: { fontSize: 14, lineHeight: 19, color: '#211B14' },
  pebble: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, backgroundColor: '#E4DBCA', borderWidth: 1, borderColor: 'rgba(60,48,36,0.5)' },
  pebbleText: { fontWeight: '700', fontSize: 14, color: '#2B241C' },
  end: { marginLeft: GUTTER, marginRight: 12, marginTop: 28, padding: 12, borderRadius: 14, backgroundColor: '#F1EBE0', color: '#2B241C', fontSize: 15, textAlign: 'center', overflow: 'hidden' },
  climber: { position: 'absolute', left: 0, top: 0, width: CLIMBER_W },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(28,22,16,0.6)' },
  bigColumn: { position: 'absolute', left: 14, right: 14, top: 48, bottom: 28, gap: 10, alignItems: 'stretch' },
  big: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', borderRadius: 22, borderWidth: 3, borderColor: '#5A4A38', overflow: 'hidden' },
  parent: { width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#F1EBE0', borderTopLeftRadius: 22, borderTopRightRadius: 30, borderBottomRightRadius: 18, borderBottomLeftRadius: 26, padding: 12, gap: 6, borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.6)', borderBottomWidth: 3, borderBottomColor: 'rgba(90,70,45,0.35)' },
  parentHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  parentLine: { fontSize: 16, color: '#2B241C' },
  oval: { width: 40, height: 46, borderRadius: 23, backgroundColor: '#6D5F4D', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ovalPhoto: { width: 40, height: 46 },
  ovalText: { color: '#F6EFE2', fontWeight: '700', fontSize: 16 },
  bigInner: { paddingTop: 70, paddingHorizontal: 22, paddingBottom: 24, gap: 16 },
  bigName: { fontWeight: '700', fontSize: 17, color: '#2B241C' },
  bigText: { fontSize: 21, lineHeight: 30, color: '#211B14', marginTop: -10 },
  reply: { marginLeft: 18, paddingLeft: 12, borderLeftWidth: 4, borderLeftColor: '#8A7A63', gap: 2 },
  replyText: { fontSize: 17, lineHeight: 24, color: '#211B14' },
  close: { position: 'absolute', right: 10, top: 10, width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#4A3F33', backgroundColor: '#EFE5D2', alignItems: 'center', justifyContent: 'center' },
});
