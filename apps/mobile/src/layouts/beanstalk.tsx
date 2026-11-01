// The Beanstalk (Steve, 2026-10-30), ported from his Claude Design file
// "Beanstalk feed" (Main.dc.html): its colours, sizes, vine geometry and timings.
// Each post sits in a frame wound with two twisting vine strands, mirrored left and
// right, that draw themselves from the bottom middle up both sides to a flower at the
// top, with leaves and tendrils along them. Below each post a two-strand stalk grows
// down to the next post, and the post's comments hang off it on big tilted leaves,
// left and right by turns. More than three wait as an uncountable cluster of leaves
// that rustles open into five when tapped; a smaller cluster below brings out five more.
// A leaf with replies sprouts them, as holly berries that grow into smaller leaves
// below it (three levels); a leaf
// whose words are cut off opens as one big leaf with the whole comment and its replies.
// Each post grows in (the card springs up, the vine draws, the leaves unfurl) whenever
// it scrolls into view, and resets when it leaves, so scrolling back redraws it.
// Steve's additions: the poster in an oval locket over the frame's top left corner,
// fruit over the top right when someone has gifted the poster tokens, and each post
// sitting a little left or right of the centre line (never more than 15%) so the
// stalk curves naturally between them. Reduced motion shows it all at once.
import { COMMENT_TEXT, type Card, type Comment } from '@prayer-tower/shared';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Image as SvgImage, Path } from 'react-native-svg';

import { Alegreya_400Regular } from '@expo-google-fonts/alegreya/400Regular';
import { Alegreya_400Regular_Italic } from '@expo-google-fonts/alegreya/400Regular_Italic';
import { Alegreya_600SemiBold } from '@expo-google-fonts/alegreya/600SemiBold';
import { Alegreya_700Bold } from '@expo-google-fonts/alegreya/700Bold';
import { Alegreya_700Bold_Italic } from '@expo-google-fonts/alegreya/700Bold_Italic';
import { HennyPenny_400Regular } from '@expo-google-fonts/henny-penny/400Regular';
import { useFonts } from 'expo-font';

import { Button } from '@/components/ui';
import { CardNoType, CardSurface } from '@/components/post-card';
import { VineFruit } from '@/components/vine-flow';
import { api } from '@/lib/api';
import { DrawBusContext, makeDrawBus, SEEN_EIGHTH, useDrawIn, type Row } from '@/lib/draw-in';
import { repliesAt, useCommentCluster, usePostComments } from '@/skins/comments';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { space } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';
import { IdleBird, vineTokens } from './vine';

/** The design's palette. */
export const BEANSTALK = {
  page: '#EFE4C6',
  cream: '#FFF7E2',
  ink: '#2A2118',
  vineInk: '#23301D',
  strand: '#4F8A35',
  strandLight: '#9CC862',
  tendril: '#3F6B2F',
  vineLeaf: '#7FB352',
  vineLeafLight: '#A9CF6A',
  petal: '#F3CF6B',
  heart: '#B23A22',
  stem: '#5E9440',
  leafA: '#B6D77A',
  leafB: '#D7EBB0',
  leafC: '#9CC862',
  button: '#D7EBB0',
  sub: '#5C4A33',
  // A little darker than the design's #2F4F86, for 4.5:1 on the darkest leaf (WCAG AA).
  link: '#23407F',
  locket: '#C9A227',
  locketFace: '#F2B9A0',
  sky: '#A9D3E8',
  hill: '#7BA05B',
  hillDark: '#4F7A3A',
  soil: '#8A5A2E',
};
/** The design's fonts: Alegreya for words, Henny Penny for the title (both SIL Open Font License). */
const FONT = { body: 'Alegreya_400Regular', semi: 'Alegreya_600SemiBold', bold: 'Alegreya_700Bold', italic: 'Alegreya_400Regular_Italic', boldItalic: 'Alegreya_700Bold_Italic', title: 'HennyPenny_400Regular' };
const LEAF_FILLS = [BEANSTALK.leafA, BEANSTALK.leafB, BEANSTALK.leafC];

/** How many leaves hang at once once spread, and how many replies show under each. */
export const PER_PAGE = 5;
/** More comments than this wait as an uncountable cluster of leaves until tapped (Steve, 2026-10-30). */
export const CLUMP_OVER = 3;
/** Comment, reply, reply to a reply: the third level is the last. */
export const MAX_LEVEL = 2;
/** The frame's vine is drawn this far round the post on every side, so nothing is cut off. */
const P = 26;

// ---------------------------------------------------------------------------
// Geometry, from the design (exported for tests)

const f = (v: number) => v.toFixed(1);
const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const lengthOf = (pts: number[][]) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!);
  return l;
};
const toD = (pts: number[][]) => 'M' + pts.map((p) => `${f(p[0]!)} ${f(p[1]!)}`).join(' L');

/** A small vine leaf from (px,py) pointing along (dx,dy), Lf long, with its midrib. */
function vineLeaf(px: number, py: number, dx: number, dy: number, Lf: number, stalk = false) {
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const vx = -dy;
  const vy = dx;
  const bx = stalk ? px + dx * 3 : px;
  const by = stalk ? py + dy * 3 : py;
  const Q = (u: number, v: number) => `${f(bx + dx * u + vx * v)} ${f(by + dy * u + vy * v)}`;
  return (
    (stalk ? `M${f(px)} ${f(py)} L${Q(0, 0)}` : `M${Q(0, 0)}`) +
    ` C${Q(Lf * 0.3, Lf * 0.34)} ${Q(Lf * 0.75, Lf * 0.3)} ${Q(Lf, 0)}` +
    ` C${Q(Lf * 0.75, -Lf * 0.3)} ${Q(Lf * 0.3, -Lf * 0.34)} ${Q(0, 0)} Z M${Q(0, 0)} L${Q(Lf * 0.8, 0)} `
  );
}

export interface FrameVine {
  w: number;
  h: number;
  s1: [string, string];
  s2: [string, string];
  len1: number;
  len2: number;
  /** Leaves in five groups round the frame, light and dark, that show one group after another. */
  la: string[];
  lb: string[];
  tendrils: string;
  flower: string;
  heart: string;
}

/**
 * The vine round a w×h post (the design's geo()): two strands that start at the
 * bottom middle and wind up the left side, mirrored up the right, meeting at a
 * flower at the top middle. Coordinates are in a box P larger on every side.
 */
export function frameVine(w: number, h: number): FrameVine {
  const r = 20;
  const L0 = P;
  const T0 = P;
  const B0 = P + h;
  const cx = P + w / 2;
  const lam = 92;
  const step = 4;
  const small = w < 420;
  const base: number[][] = [];
  const seg = (x0: number, y0: number, x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      base.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, nx, ny]);
    }
  };
  const arc = (ax: number, ay: number, a0: number, a1: number) => {
    const n = Math.max(2, Math.round((r * Math.abs(a1 - a0)) / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      base.push([ax + r * Math.cos(a), ay + r * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
  };
  seg(cx, B0, L0 + r, B0, 0, 1);
  arc(L0 + r, B0 - r, Math.PI / 2, Math.PI);
  seg(L0, B0 - r, L0, T0 + r, -1, 0);
  arc(L0 + r, T0 + r, Math.PI, 1.5 * Math.PI);
  seg(L0 + r, T0, cx, T0, 0, -1);
  base.push([cx, T0, 0, -1]);
  const S = [0];
  for (let i = 1; i < base.length; i++) S.push(S[i - 1]! + Math.hypot(base[i]![0]! - base[i - 1]![0]!, base[i]![1]! - base[i - 1]![1]!));
  const Lt = S[S.length - 1]!;
  const idxAt = (s: number) => {
    let lo = 0;
    let hi = S.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (S[mid]! < s) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const la = ['', '', '', '', ''];
  const lb = ['', '', '', '', ''];
  let td = '';
  const half = (mir: boolean, ph: number) => {
    const nX = (i: number) => (mir ? -base[i]![2]! : base[i]![2]!);
    const strand = (A: number, phase: number) =>
      base.map((b, i) => {
        const s = S[i]!;
        const env = Math.max(0, Math.min(1, s / 40, (Lt - s) / 40));
        const o = A * env * Math.sin((2 * Math.PI * s) / lam + phase);
        const x = b[0]! + b[2]! * o;
        return [mir ? 2 * cx - x : x, b[1]! + b[3]! * o];
      });
    const s1 = strand(5.5, ph);
    const s2 = strand(4.5, ph + Math.PI);
    let k = 0;
    for (let s = 34 + (mir ? lam * 0.25 : 0); s < Lt - 22; s += lam / 2, k++) {
      const i = idxAt(s);
      const p = s1[i]!;
      const q = s1[Math.min(i + 1, s1.length - 1)]!;
      let tx = q[0]! - p[0]!;
      let ty = q[1]! - p[1]!;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const side = k % 2 ? 1 : -1;
      const dx = nX(i) * 0.8 + tx * 0.62 * side;
      const dy = base[i]![3]! * 0.8 + ty * 0.62 * side;
      const Lf = (small ? 18 : 24) * (0.82 + 0.36 * (((k * 37 + (mir ? 5 : 0)) % 10) / 10));
      const d = vineLeaf(p[0]!, p[1]!, dx, dy, Lf, true);
      const g = Math.min(4, Math.floor((s / Lt) * 5));
      if (k % 3 === 0) lb[g] += d;
      else la[g] += d;
    }
    let j = 0;
    for (let s = lam * 0.8 + (mir ? lam * 0.45 : 0); s < Lt - 40; s += lam * 1.9, j++) {
      const i = idxAt(s);
      const p = s2[i]!;
      const ccx = p[0]! + nX(i) * 10;
      const ccy = p[1]! + base[i]![3]! * 10;
      const a0 = Math.atan2(p[1]! - ccy, p[0]! - ccx);
      const spin = (j % 2 ? 1 : -1) * (mir ? -1 : 1);
      let d = `M${f(p[0]!)} ${f(p[1]!)}`;
      for (let t = 0.3; t <= 3 * Math.PI; t += 0.3) {
        const rad = 10 * (1 - t / (3.6 * Math.PI));
        d += ` L${f(ccx + rad * Math.cos(a0 + spin * t))} ${f(ccy + rad * Math.sin(a0 + spin * t))}`;
      }
      td += d + ' ';
    }
    return { s1: toD(s1), s2: toD(s2), l1: lengthOf(s1), l2: lengthOf(s2) };
  };
  const A = half(false, 0);
  const B = half(true, 1.4);
  const fx = cx;
  const fy = T0 - 2;
  let fl = '';
  for (let m = 0; m < 5; m++) {
    const a = -Math.PI / 2 + (m * 2 * Math.PI) / 5;
    const px = fx + Math.cos(a) * 6.5;
    const py = fy + Math.sin(a) * 6.5;
    fl += `M${f(px - 5)} ${f(py)} a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 `;
  }
  const E = (d: string) => d || 'M0 0';
  return {
    w: w + 2 * P,
    h: h + 2 * P,
    s1: [A.s1, B.s1],
    s2: [A.s2, B.s2],
    len1: Math.ceil(Math.max(A.l1, B.l1)) + 4,
    len2: Math.ceil(Math.max(A.l2, B.l2)) + 4,
    la: la.map(E),
    lb: lb.map(E),
    tendrils: E(td),
    flower: fl,
    heart: `M${f(fx - 4)} ${f(fy)} a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0`,
  };
}

/** The post's width in the lane: room either side for the vine, the locket and the sway. */
export function frameWidth(lane: number) {
  return Math.max(200, Math.min(540, lane * 0.9 - 60));
}

/** How far a post may sit off the centre line: never more than 15% of the lane, and never so far its vine leaves the screen. */
export function maxShift(lane: number) {
  return Math.max(0, Math.min(lane * 0.15, (lane - frameWidth(lane)) / 2 - 30));
}

/**
 * Each post sits a little left or right of the centre line, by turns, by an amount
 * of its own (from its id), so the stalk curves naturally from one to the next.
 */
export function postShift(id: string, index: number, lane: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const mag = 0.55 + 0.45 * ((h % 1000) / 999);
  return (index % 2 === 0 ? -1 : 1) * mag * maxShift(lane);
}

/** One leaf hanging below a post. */
export interface HangingLeaf {
  comment: Comment;
  /** 1 a comment, 2 a reply, 3 a reply to a reply. */
  level: number;
  /** Where it is in the comments, for the big leaf: top-level index, then reply indexes. */
  path: number[];
  x: number;
  y: number;
  lw: number;
  side: -1 | 1;
  ang: number;
  fill: string;
  replies: number;
  open: boolean;
  /** The top comment of a closed cluster: tapping it rustles the cluster open. */
  cluster?: boolean;
  /** Where it is in the latest five to come out, for the unfurl stagger; below 0 for those already out. */
  k: number;
}

export interface Hanging {
  H: number;
  leaves: HangingLeaf[];
  stems: string;
  s1: string;
  s2: string;
  l1: number;
  l2: number;
  deco: string;
  /** More comments wait in a smaller cluster below the leaves, hanging at pgY. */
  pager: boolean;
  pgY: number;
  /** Where the closed cluster of leaves hangs, when the comments are still clustered. */
  clump: { x: number; y: number; side: number } | null;
  page: number;
  pages: number;
}

export interface LeafState {
  page: number;
  /** The open comment (by index in all of them) and the open reply under it. */
  open: number | null;
  open2: number | null;
  /** The cluster has rustled open and its leaves spread out. */
  spread?: boolean;
}

/**
 * The stalk below a post and the leaves on it (the design's layoutComments and
 * vineDown). `bend` moves the stalk sideways down its length, to the next post.
 */
export function hanging(w: number, top: Comment[], kids: Map<string, Comment[]>, cv: LeafState, seed: number, bend = 0): Hanging {
  const DEG = Math.PI / 180;
  const cx = w / 2;
  const lw = Math.max(170, Math.round(w * 0.5));
  const A = [22, 15, 27, 18, 24];
  const clumped = top.length > CLUMP_OVER && !cv.spread;
  const pages = Math.max(1, Math.ceil(top.length / PER_PAGE));
  const page = Math.min(cv.page, pages - 1);
  // Spread, five leaves hang; each tap on the smaller cluster below them rustles out five more.
  // Closed, only the top comment hangs, its first line showing, in front of the bunch.
  const shown = clumped ? top.slice(0, 1) : top.slice(0, (page + 1) * PER_PAGE);
  const leaves: HangingLeaf[] = [];
  const subs: HangingLeaf[] = [];
  let stems = '';
  let prevY = -40;
  let maxB = 60;
  const sideBottom: Record<string, number> = { '-1': 0, '1': 0 };
  // The section's height depends on the leaves, and the bend on the height: lay out once to find it.
  const layout = (H: number) => {
    const sway = (y: number) => bend * smooth(y / H);
    const vx = (y: number) => cx + 7 * Math.sin(y / 30) + sway(y);
    return { sway, vx };
  };
  let { sway, vx } = layout(400);
  const place = () => {
    leaves.length = 0;
    subs.length = 0;
    stems = '';
    prevY = -40;
    maxB = 60;
    sideBottom['-1'] = 0;
    sideBottom['1'] = 0;
    shown.forEach((c, k) => {
      const gi = k;
      const side = (k % 2 ? 1 : -1) as -1 | 1;
      const y = Math.max(prevY + 70, 30, sideBottom[side]! + 30);
      prevY = y;
      const tipX = cx + sway(y + 26) + side * 16;
      const tipY = y + 26;
      const a = A[k % A.length]!;
      const vX = vx(y);
      stems += `M${f(vX)} ${f(y)} C${f(vX + side * 8)} ${f(y + 8)} ${f(tipX - side * 6)} ${f(tipY - 10)} ${f(tipX)} ${f(tipY)} `;
      const reps = kids.get(c.id) ?? [];
      const open = cv.open === gi && reps.length > 0;
      leaves.push({ comment: c, level: 1, path: [gi], x: Math.round(side < 0 ? tipX - lw : tipX), y: Math.round(tipY - 50), lw, side, ang: side * a, fill: LEAF_FILLS[(k + seed) % 3]!, replies: clumped ? 0 : reps.length, open: open && !clumped, k: k - page * PER_PAGE, cluster: clumped });
      const ccX = tipX + side * (lw / 2) * Math.cos(a * DEG);
      const ccY = tipY + (lw / 2) * Math.sin(a * DEG);
      let bottom = ccY + 58;
      if (open) {
        const rw = Math.round(lw * 0.64);
        let cur = ccY + 54;
        reps.slice(0, PER_PAGE).forEach((r, m) => {
          const baseX = side < 0 ? ccX + rw / 2 : ccX - rw / 2;
          const baseY = cur + 6;
          stems += `M${f(ccX)} ${f(ccY + 28)} C${f(ccX)} ${f(baseY - 18)} ${f(baseX - side * 4)} ${f(baseY - 12)} ${f(baseX)} ${f(baseY)} `;
          const reps2 = kids.get(r.id) ?? [];
          const open2 = cv.open2 === m && reps2.length > 0;
          const ra = 12;
          subs.push({ comment: r, level: 2, path: [gi, m], x: Math.round(side < 0 ? baseX - rw : baseX), y: Math.round(baseY - 42), lw: rw, side, ang: side * ra, fill: LEAF_FILLS[(k + m + seed + 1) % 3]!, replies: reps2.length, open: open2, k: m });
          const rcX = baseX + side * (rw / 2) * Math.cos(ra * DEG);
          const rcY = baseY + (rw / 2) * Math.sin(ra * DEG);
          cur = rcY + 50;
          if (open2) {
            const qw = Math.round(lw * 0.46);
            reps2.slice(0, PER_PAGE).forEach((q, z) => {
              const bX = side < 0 ? rcX + qw / 2 : rcX - qw / 2;
              const bY = cur + 4;
              stems += `M${f(rcX)} ${f(rcY + 22)} C${f(rcX)} ${f(bY - 14)} ${f(bX - side * 3)} ${f(bY - 10)} ${f(bX)} ${f(bY)} `;
              subs.push({ comment: q, level: 3, path: [gi, m, z], x: Math.round(side < 0 ? bX - qw : bX), y: Math.round(bY - 33), lw: qw, side, ang: side * 9, fill: LEAF_FILLS[(k + m + z + seed + 2) % 3]!, replies: 0, open: false, k: z });
              cur = bY + (qw / 2) * Math.sin(9 * DEG) + 33 + 12;
            });
          }
        });
        bottom = Math.max(bottom, cur);
      }
      sideBottom[side] = bottom;
      maxB = Math.max(maxB, bottom);
    });
  };
  place();
  const pager = !clumped && top.length > shown.length;
  let H = top.length === 0 ? 96 : Math.round(maxB + (clumped ? 200 : 20));
  let pgY = 0;
  if (pager) {
    pgY = H + 50;
    H += 130;
  }
  if (bend) {
    ({ sway, vx } = layout(H));
    place();
  }
  // The two strands, swaying in and out but meeting the posts above and below at the middle.
  const env = (y: number) => Math.max(0, Math.min(1, y / 26, (H - y) / 26));
  const strand = (amp: number, ph: number) => {
    const pts: number[][] = [];
    for (let y = 0; y <= H; y += 4) pts.push([cx + sway(y) + amp * env(y) * Math.sin(y / 30 + ph), y]);
    pts.push([cx + bend, H]);
    return pts;
  };
  // The bunch behind a closed cluster grows from the node where the top comment's stem meets its leaf.
  const lead = leaves[0];
  const clump: Hanging['clump'] = clumped && lead ? { x: lead.side < 0 ? lead.x + lead.lw : lead.x, y: lead.y + 50, side: lead.side } : null;
  const s1 = strand(7, 0);
  const s2 = strand(5.5, Math.PI);
  let deco = '';
  if (top.length === 0 || (!pager && !clumped)) {
    const y = H - 30;
    deco += vineLeaf(cx + sway(y) + 7 * env(y) * Math.sin(y / 30), y, 0.9, 0.44, 14);
  }
  if (top.length > 0 && H > 120) {
    const y = Math.round(H * 0.5);
    deco += vineLeaf(cx + sway(y) + 7 * env(y) * Math.sin(y / 30), y, shown.length % 2 ? -1 : 1, 0.5, 15);
  }
  return { H, leaves: leaves.concat(subs), stems: stems || 'M0 0', s1: toD(s1), s2: toD(s2), l1: Math.ceil(lengthOf(s1)) + 4, l2: Math.ceil(lengthOf(s2)) + 4, deco: deco || 'M0 0', pager, pgY, page, pages, clump };
}

/** The design's leaf, drawn in a 200×100 box: wide at the base (left), a pointed tip (right). */
export const LEAF_PATH = 'M2 50 C 4 34, 22 10, 66 6 C 112 2, 160 20, 198 60 C 158 82, 110 98, 64 94 C 24 90, 4 66, 2 50 Z';
const LEAF_VEINS = 'M2 50 C 60 46, 140 48, 198 60 M46 48 C 56 34, 64 22, 74 12 M46 48 C 56 62, 62 76, 70 88 M96 48 C 106 34, 116 22, 128 14 M96 49 C 106 62, 114 74, 124 84 M144 52 C 152 44, 158 36, 168 30 M144 53 C 150 62, 156 68, 164 74';

/** Characters that fit on a leaf `W` wide at `fs` points, over `lines` lines. */
export function leafChars(W: number, fs: number, lines: number) {
  return Math.max(12, Math.floor((W * 0.64) / (fs * 0.5)) * lines);
}

/** Cuts text to fit, at a word if it can, with "..". Returns the text and whether it was cut. */
export function fitText(text: string, max: number): { text: string; cut: boolean } {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return { text: t, cut: false };
  const head = t.slice(0, max - 2);
  const gap = head.lastIndexOf(' ');
  return { text: `${(gap > max * 0.6 ? head.slice(0, gap) : head).replace(/[\s,.;:]+$/, '')}..`, cut: true };
}

/** Top-level comments newest first, and each comment's replies in order. */
/** Moved to the shared skin hooks; kept here for older imports. */
export { commentTree } from '@/skins/comments';

// ---------------------------------------------------------------------------
// The growing clock: each post runs one clock from 0 to 2 seconds when it scrolls
// into view, and every piece of its drawing reads its own stretch of it, with the
// design's delays, lengths and easings.

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CLOCK = 2000;
const EASE = {
  out: Easing.out(Easing.quad),
  in: Easing.in(Easing.quad),
  vine: Easing.bezier(0.4, 0.15, 0.45, 1),
  card: Easing.bezier(0.2, 1.25, 0.35, 1),
  pop: Easing.bezier(0.3, 1.7, 0.5, 1),
  unfurl: Easing.bezier(0.3, 1.5, 0.5, 1),
  linear: Easing.linear,
};
function span(t: Animated.Value, at: number, ms: number, from: number, to: number, easing = EASE.linear) {
  return t.interpolate({ inputRange: [at, at + ms], outputRange: [from, to], easing, extrapolate: 'clamp' });
}

/**
 * The shared draw-in (lib/draw-in) in Beanstalk's style: the design's 2-second linear clock,
 * grown once 8% of the post is on screen (less the bottom 4%), ungrown once it is wholly off,
 * so it grows again each time it comes back.
 */
function useClock(ref: React.RefObject<Row | null>) {
  const [grown, setGrown] = useState(false);
  const { drawn } = useDrawIn(ref, { duration: CLOCK, easing: EASE.linear, to: CLOCK, seen: SEEN_EIGHTH, firstCheck: 60, onShow: setGrown });
  return { t: drawn, grown };
}

/** A short clock of its own, for leaves that unfurl when they appear (a new page, a reply). */
function useUnfurl(key: unknown, ms = 700) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(reduced ? ms : 0)).current;
  useEffect(() => {
    if (reduced) return t.setValue(ms);
    t.setValue(0);
    Animated.timing(t, { toValue: ms, duration: ms, easing: Easing.linear, useNativeDriver: false }).start();
  }, [key, reduced, t, ms]);
  return t;
}

// ---------------------------------------------------------------------------
// The pieces

/** The vine round the frame, drawing itself on the post's clock. */
function FrameDrawing({ geo, t }: { geo: FrameVine; t: Animated.Value }) {
  const dash = (len: number, at: number) => ({ strokeDasharray: [len, len], strokeDashoffset: span(t, at, 1350, len, 0, EASE.vine) });
  const s1 = dash(geo.len1, 0);
  const s2 = dash(geo.len2, 120);
  const fade = (at: number, ms: number) => span(t, at, ms, 0, 1);
  const flower = span(t, 1300, 450, 0, 1, EASE.pop);
  const heart = span(t, 1450, 350, 0, 1, EASE.pop);
  const cx = geo.w / 2;
  const fy = P - 2;
  return (
    <Svg aria-hidden pointerEvents="none" style={[styles.frameSvg, { width: geo.w, height: geo.h }]} width={geo.w} height={geo.h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <AnimatedPath d={geo.tendrils} fill="none" stroke={BEANSTALK.tendril} strokeWidth={2.4} strokeLinecap="round" opacity={fade(1050, 500)} />
      {geo.s2.map((d, i) => (
        <AnimatedPath key={`k2${i}`} d={d} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" {...s2} />
      ))}
      {geo.s2.map((d, i) => (
        <AnimatedPath key={`s2${i}`} d={d} fill="none" stroke={BEANSTALK.strandLight} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...s2} />
      ))}
      {geo.s1.map((d, i) => (
        <AnimatedPath key={`k1${i}`} d={d} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={9.5} strokeLinecap="round" strokeLinejoin="round" {...s1} />
      ))}
      {geo.s1.map((d, i) => (
        <AnimatedPath key={`s1${i}`} d={d} fill="none" stroke={BEANSTALK.strand} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" {...s1} />
      ))}
      {geo.la.map((d, g) => (
        <AnimatedPath key={`la${g}`} d={d} fill={BEANSTALK.vineLeaf} stroke={BEANSTALK.vineInk} strokeWidth={1.7} opacity={fade([200, 420, 660, 900, 1120][g]!, 280)} />
      ))}
      {geo.lb.map((d, g) => (
        <AnimatedPath key={`lb${g}`} d={d} fill={BEANSTALK.vineLeafLight} stroke={BEANSTALK.vineInk} strokeWidth={1.7} opacity={fade([200, 420, 660, 900, 1120][g]!, 280)} />
      ))}
      {/* The flower at the top middle pops open once the vine meets there. */}
      <AnimatedPath d={geo.flower} fill={BEANSTALK.petal} stroke={BEANSTALK.vineInk} strokeWidth={1.8} originX={cx} originY={fy} scale={flower} />
      <AnimatedPath d={geo.heart} fill={BEANSTALK.heart} stroke={BEANSTALK.vineInk} strokeWidth={1.5} originX={cx} originY={fy} scale={heart} />
    </Svg>
  );
}

/** The poster in an oval gold locket over the frame's top left corner (drawn on a 50×64 grid, shown 70% larger). */
const LOCKET_SCALE = 1.7;
const LOCKET_W = 50 * LOCKET_SCALE;
const LOCKET_H = 64 * LOCKET_SCALE;

function Locket({ name, photo, clip }: { name: string; photo?: string | null; clip: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={styles.locket} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={LOCKET_W} height={LOCKET_H} viewBox="0 0 50 64">
        <Defs>
          <ClipPath id={clip}>
            <Ellipse cx={25} cy={37} rx={18} ry={21} />
          </ClipPath>
        </Defs>
        <Circle cx={25} cy={6} r={4.5} fill="none" stroke={BEANSTALK.ink} strokeWidth={4} />
        <Circle cx={25} cy={6} r={4.5} fill="none" stroke={BEANSTALK.locket} strokeWidth={2} />
        <Ellipse cx={25} cy={37} rx={23} ry={26} fill={BEANSTALK.locket} stroke={BEANSTALK.ink} strokeWidth={2} />
        <Ellipse cx={25} cy={37} rx={18} ry={21} fill={BEANSTALK.locketFace} stroke={BEANSTALK.ink} strokeWidth={1.5} />
        {/* The member's own photo, when they've added one under Me. */}
        {photo ? <SvgImage href={{ uri: photo }} x={7} y={16} width={36} height={42} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} /> : null}
        {photo ? <Ellipse cx={25} cy={37} rx={18} ry={21} fill="none" stroke={BEANSTALK.ink} strokeWidth={1.5} /> : null}
      </Svg>
      {photo ? null : <Text style={styles.locketText}>{initial}</Text>}
    </View>
  );
}

/** One hanging leaf: it unfurls from its stem, tilted as in the design. */
const Leaf = memo(function Leaf({ leaf, t, at, onTap }: { leaf: HangingLeaf; t: Animated.Value; at: number; onTap: (l: HangingLeaf, cut: boolean) => void }) {
  const { t: tr } = useLocale();
  const fs = leaf.level === 1 ? 14 : leaf.level === 2 ? 12.5 : 12;
  const nameFs = leaf.level === 1 ? 13.5 : leaf.level === 2 ? 12 : 11.5;
  // A true leaf's proportions at a fixed size, as the drawing is (200 by 100): the words never
  // stretch it into a puffy leaf (Steve, 2026-10-30, 2026-11-01). A reply is half as tall as wide.
  const small = leaf.level > 1;
  const minH = small ? Math.round(leaf.lw * 0.52) : Math.max(100, Math.round(leaf.lw * 0.55));
  const left = leaf.side < 0;
  // The text sits in the leaf's wide middle, away from the tip.
  const textW = leaf.lw * 0.64;
  const fit = fitText(leaf.comment.body, leafChars(textW, fs, small ? 1 : 2));
  const hint = leaf.replies > 0 && leaf.level < 3 ? (leaf.open ? (fit.cut ? tr('beanstalk.readMore') : tr('beanstalk.fold')) : tr('beanstalk.replies', { count: leaf.replies })) : '';
  const actionable = fit.cut || (leaf.replies > 0 && leaf.level < 3);
  // A reply sprouts first as a cluster of holly berries at its stem, which then grows into its leaf.
  const sprout = leaf.level > 1;
  const lead = sprout ? BERRY_MS : 0;
  const grow = span(t, at + lead, 450, 0, 1, EASE.unfurl);
  const turn = span(t, at + lead, 450, -14, 0, EASE.unfurl);
  const origin = left ? '100% 50%' : '0% 50%';
  return (
    <View style={[styles.leafAt, { left: leaf.x, top: leaf.y, width: leaf.lw, transformOrigin: origin, transform: [{ rotate: `${leaf.ang}deg` }] }]}>
      {sprout ? <Berries t={t} at={at} left={left} minH={minH} /> : null}
      <Animated.View
        style={{
          height: minH,
          transformOrigin: origin,
          transform: [{ rotate: turn.interpolate({ inputRange: [-14, 0], outputRange: ['-14deg', '0deg'] }) }, { scale: grow }],
        }}>
        <Pressable
          disabled={!actionable}
          onPress={() => onTap(leaf, fit.cut)}
          accessibilityRole={actionable ? 'button' : 'text'}
          accessibilityLabel={`${leaf.comment.author.displayName}: ${leaf.comment.body}`}
          accessibilityHint={leaf.replies > 0 && leaf.level < 3 && !leaf.open ? tr('beanstalk.repliesHint') : fit.cut ? tr('beanstalk.readHint') : actionable ? tr('beanstalk.repliesHint') : undefined}
          style={[styles.leafBody, small ? styles.leafBodySmall : null, { height: minH, paddingLeft: `${left ? 24 : 12}%`, paddingRight: `${left ? 12 : 24}%` }]}>
          <Svg aria-hidden pointerEvents="none" style={[StyleSheet.absoluteFill, left ? styles.flip : null]} viewBox="0 0 200 100" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Path d={LEAF_PATH} fill={leaf.fill} stroke={BEANSTALK.vineInk} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            <Path d={LEAF_VEINS} fill="none" stroke={BEANSTALK.stem} strokeWidth={1.2} strokeLinecap="round" opacity={0.55} vectorEffect="non-scaling-stroke" />
          </Svg>
          <Text style={[styles.leafName, { fontSize: nameFs }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {leaf.comment.author.displayName}
          </Text>
          <Text style={[styles.leafText, { fontSize: fs, lineHeight: fs * 1.25 }]} numberOfLines={small ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {fit.text}
          </Text>
          {hint && !small ? <Text style={styles.leafHint} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{hint}</Text> : null}
        </Pressable>
      </Animated.View>
    </View>
  );
});

const BERRY_MS = 320;
const HOLLY = { berry: '#C8102E', shine: '#FF8A8A', ink: '#5A0A12' };

/** Holly berries at a reply's stem: they pop out first, and the reply's leaf grows out of them. */
function Berries({ t, at, left, minH }: { t: Animated.Value; at: number; left: boolean; minH: number }) {
  const pop = span(t, at, BERRY_MS, 0, 1, EASE.pop);
  return (
    <Animated.View pointerEvents="none" style={[styles.berries, { top: minH / 2 - 15, [left ? 'right' : 'left']: -14, transform: [{ scale: pop }] }]}>
      <Svg aria-hidden width={30} height={30} viewBox="0 0 30 30" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[
          [10, 11],
          [20, 12],
          [15, 20],
        ].map(([x, y]) => (
          <Circle key={`${x}`} cx={x} cy={y} r={6} fill={HOLLY.berry} stroke={HOLLY.ink} strokeWidth={1.2} />
        ))}
        {[
          [8, 9],
          [18, 10],
          [13, 18],
        ].map(([x, y]) => (
          <Circle key={`s${x}`} cx={x} cy={y} r={1.8} fill={HOLLY.shine} />
        ))}
      </Svg>
    </Animated.View>
  );
}

/**
 * A cluster of leaves as they grow on a real vine (Steve, 2026-10-30): a short stem hangs from
 * the node, and each leaf joins it at a node of its own by its stalk (petiole), left and right
 * by turns, spreading outward so no two leaves on the stem overlap; the last leaf ends the stem.
 * The stem leans out from the vine to the side of the leaf it hangs under (`lean`).
 * Side (0 ends the stem), angle below level (degrees), blade length (×).
 */
const BUNCH = [
  [-1, 22, 0.62],
  [1, 28, 0.6],
  [-1, 40, 0.56],
  [1, 50, 0.5],
  [0, 90, 0.46],
] as const;

/** The leaves bunched behind a closed cluster, or the smaller bunch that brings out five more. A tap rustles them. */
function Bunch({ x, y, size, lean = 0, t, at, go, onDone, label, hint }: { x: number; y: number; size: number; lean?: number; t: Animated.Value; at: number; go: number; onDone: () => void; label?: string; hint?: string }) {
  const { t: tr } = useLocale();
  const reduced = useReducedMotion();
  const rustle = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const start = useCallback(() => {
    if (busy.current) return;
    if (reduced) return onDone();
    busy.current = true;
    Animated.timing(rustle, { toValue: 1, duration: 560, easing: Easing.linear, useNativeDriver: false }).start(() => {
      busy.current = false;
      rustle.setValue(0);
      onDone();
    });
  }, [reduced, onDone, rustle]);
  // Tapping the top comment's leaf rustles the bunch too.
  useEffect(() => {
    if (go) start();
  }, [go]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each leaf shivers on its stalk, a little out of step with the others.
  const shiver = (i: number) =>
    rustle.interpolate({ inputRange: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1], outputRange: ['0deg', `${i % 2 ? 9 : -9}deg`, `${i % 2 ? -7 : 7}deg`, `${i % 2 ? 8 : -6}deg`, `${i % 2 ? -5 : 6}deg`, `${i % 2 ? 4 : -4}deg`, `${i % 2 ? -2 : 2}deg`, '0deg'] });
  const L = 170 * size;
  // Nodes far enough apart that leaves on the same side clear each other.
  const gap = Math.round(L * 0.24);
  const reach = L * 0.8;
  const out = gap * 0.35 * Math.abs(lean);
  const box = { w: Math.round(reach * 2 + 20 + out * BUNCH.length), h: Math.round(gap * BUNCH.length + L * 0.6 + 30) };
  const cx = lean < 0 ? box.w - reach - 10 : lean > 0 ? reach + 10 : box.w / 2;
  const nodes = BUNCH.map((_, i) => ({ x: cx + lean * out * (i + 1) + (i % 2 ? 3 : -3) * size, y: 8 + gap * (i + 0.7) }));
  const last = nodes[nodes.length - 1]!;
  const stem = `M${cx} 0 C ${cx} ${gap}, ${cx + lean * out * 2} ${last.y * 0.5}, ${last.x} ${last.y}`;
  return (
    <Animated.View style={[styles.bunchAt, { left: x - cx, top: y - 10, width: box.w, height: box.h, opacity: span(t, at, 400, 0, 1) }]} pointerEvents="box-none">
      <Pressable onPress={start} disabled={!label} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={tr('beanstalk.clusterHint')} style={StyleSheet.absoluteFill}>
        <Svg aria-hidden width={box.w} height={box.h} style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d={stem} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={Math.max(3, 6 * size)} strokeLinecap="round" />
          <Path d={stem} fill="none" stroke={BEANSTALK.stem} strokeWidth={Math.max(1.5, 3.5 * size)} strokeLinecap="round" />
        </Svg>
        {BUNCH.map(([side, angle, len], i) => {
          const blade = L * len;
          const stalk = Math.round(blade * 0.3);
          const w = stalk + blade;
          const h = blade / 2;
          const left = side < 0;
          const n = nodes[i]!;
          const origin = left ? '100% 50%' : '0% 50%';
          const turn = side === 0 ? angle - lean * 35 : side * angle;
          return (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={[styles.bunchLeaf, { left: left ? n.x - w : n.x, top: n.y - h / 2, width: w, height: h, transformOrigin: origin, transform: [{ rotate: `${turn}deg` }, { scale: span(t, at + i * 80, 450, 0.2, 1, EASE.unfurl) }] }]}>
              <Animated.View style={{ flex: 1, transformOrigin: origin, transform: [{ rotate: shiver(i) }] }}>
                <Svg aria-hidden width={w} height={h} style={left ? styles.flip : null} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Path d={`M0 ${h / 2} Q ${stalk / 2} ${h / 2 - 3 * size} ${stalk + 2} ${h / 2}`} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={Math.max(2.5, 4 * size)} strokeLinecap="round" />
                  <Path d={`M0 ${h / 2} Q ${stalk / 2} ${h / 2 - 3 * size} ${stalk + 2} ${h / 2}`} fill="none" stroke={BEANSTALK.stem} strokeWidth={Math.max(1, 2 * size)} strokeLinecap="round" />
                  <G transform={`translate(${stalk} 0) scale(${blade / 200} ${h / 100})`}>
                    <Path d={LEAF_PATH} fill={LEAF_FILLS[(i + 1) % 3]!} stroke={BEANSTALK.vineInk} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
                    <Path d={LEAF_VEINS} fill="none" stroke={BEANSTALK.stem} strokeWidth={1.2} strokeLinecap="round" opacity={0.55} vectorEffect="non-scaling-stroke" />
                  </G>
                </Svg>
              </Animated.View>
            </Animated.View>
          );
        })}
        {hint ? <Text style={[styles.bunchHint, { top: box.h - 22 }]}>{hint}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

/** The whole of a cut-off comment and its replies, on a card in the middle of the screen. */
function Reader({ comment, kids, onClose }: { comment: Comment | null; kids: Map<string, Comment[]>; onClose: () => void }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!comment) return;
    grow.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(grow, { toValue: 1, duration: 500, easing: Easing.bezier(0.25, 1.3, 0.5, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [comment, reduced, grow]);
  useEffect(() => {
    if (!comment || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [comment, onClose]);
  const thread = (c: Comment, level: number): React.ReactNode =>
    repliesAt(kids, c.id, level, MAX_LEVEL).map((r) => (
      <View key={r.id} style={[styles.bi, level === 1 ? styles.bi1 : styles.bi2]}>
        <Text style={styles.biName}>{r.author.displayName}</Text>
        <Text style={styles.biText}>{r.body}</Text>
        {level < MAX_LEVEL ? thread(r, level + 1) : null}
      </View>
    ));
  return (
    <Modal visible={!!comment} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bigScrim}>
        {comment ? (
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.bigLeaf,
              {
                opacity: grow,
                transform: [{ rotate: grow.interpolate({ inputRange: [0, 1], outputRange: ['-24deg', '0deg'] }) }, { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }],
              },
            ]}>
            <ScrollView style={styles.bigScroll} contentContainerStyle={styles.bigInner}>
              <View style={styles.bi}>
                <Text style={styles.biName}>{comment.author.displayName}</Text>
                <Text style={[styles.biText, styles.bi0]}>{comment.body}</Text>
              </View>
              {thread(comment, 1)}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={styles.bigClose}>
              <Svg width={18} height={18} aria-hidden>
                <Path d="M3 3 L 15 15 M15 3 L 3 15" stroke={BEANSTALK.ink} strokeWidth={3} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

/** The stem and leaf that lead the stalk down into the newest post. */
function Lead({ shift }: { shift: number }) {
  return (
    <View style={[styles.lead, { transform: [{ translateX: shift }] }]} pointerEvents="none">
      <Svg width={60} height={60} aria-hidden>
        <Path d="M30 0 C 42 16, 18 30, 30 44 C 36 52, 31 57, 30 60" fill="none" stroke={BEANSTALK.vineInk} strokeWidth={10} strokeLinecap="round" />
        <Path d="M30 0 C 42 16, 18 30, 30 44 C 36 52, 31 57, 30 60" fill="none" stroke={BEANSTALK.strand} strokeWidth={6} strokeLinecap="round" />
        <Path d="M34 22 C 42 12, 54 13, 58 20 C 52 28, 42 28, 34 22 Z M34 22 L 54 20" fill={BEANSTALK.vineLeaf} stroke={BEANSTALK.vineInk} strokeWidth={1.8} />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// One post: its vine-wound card, then the stalk down to the next post with its leaves.

const Post = memo(function Post({
  card,
  index,
  width,
  shift,
  next,
  first,
  renderCard,
}: {
  card: Card;
  index: number;
  width: number;
  /** Where this post sits, and where the next one does, off the centre line. */
  shift: number;
  next: number;
  first: boolean;
  renderCard: FeedLayoutProps['renderCard'];
}) {
  const { t: tr } = useLocale();
  const here = useRef<Row>(null);
  const { t, grown } = useClock(here);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // The comments and how their cluster opens come from the shared skin hooks (skins/comments.ts); this skin draws them.
  const cluster = useCommentCluster();
  const cv = cluster.state;
  const cyc = cluster.cycle;
  const [reading, setReading] = useState<Comment | null>(null);
  // Bumped when the top comment of a closed cluster is tapped, to rustle the bunch open.
  const [go, setGo] = useState(0);
  const { top, kids, total } = usePostComments(card, grown);
  const geo = useMemo(() => (size.w > 20 && size.h > 20 ? frameVine(Math.round(size.w), Math.round(size.h)) : null), [size]);
  const hang = useMemo(() => hanging(width, top, kids, cv, index, next - shift), [width, top, kids, cv, index, next, shift]);
  // A new page of leaves, or a reply opening, unfurls on its own short clock.
  const pageT = useUnfurl(cyc, 1000);
  const openT = useUnfurl(`${cv.open}:${cv.open2}`, 950);

  const onTap = useCallback(
    (leaf: HangingLeaf, cut: boolean) => {
      // A leaf with replies sprouts them first (holly berries that grow into leaves); a leaf
      // whose words are cut off opens as the big leaf once its replies are out, or straight away.
      if (leaf.cluster) return setGo((g) => g + 1);
      const sprouts = leaf.replies > 0 && leaf.level < 3;
      if (cut && (!sprouts || leaf.open)) return setReading(leaf.comment);
      if (!sprouts) return;
      if (leaf.level === 1) cluster.toggleReplies(1, leaf.path[0]!);
      else cluster.toggleReplies(2, leaf.path[1]!);
    },
    [cluster.toggleReplies], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const spread = useCallback(() => onPage(0), []); // eslint-disable-line react-hooks/exhaustive-deps
  const more = useCallback(() => onPage(hang.page + 1), [hang.page]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPage = cluster.showPage;
  const closeReader = useCallback(() => setReading(null), []);
  // Its comments show on the leaves, so the card doesn't repeat one.
  const shown = useMemo(() => (card.counts.comments > 0 ? { ...card, topComment: null } : card), [card]);
  const surface = useMemo(() => ({ backgroundColor: BEANSTALK.cream, borderColor: BEANSTALK.ink, borderWidth: 3, borderRadius: 18, padding: space.md, paddingTop: 50, overflow: 'hidden' as const }), []);

  // The card springs up from the stalk: from low, narrow and flat, to whole.
  const cardY = span(t, 100, 600, 80, 0, EASE.card);
  const cardSX = span(t, 100, 600, 0.72, 1, EASE.card);
  const cardSY = span(t, 100, 600, 0.06, 1, EASE.card);
  const cardO = span(t, 100, 200, 0, 1);
  const strandDash = (len: number) => ({ strokeDasharray: [len, len], strokeDashoffset: span(t, 500, 750, len, 0, EASE.in) });
  const fruitPop = span(t, 1300, 450, 0, 1, EASE.pop);

  return (
    <View ref={here} style={{ width, alignSelf: 'center', transform: [{ translateX: shift }] }}>
      {first ? <Lead shift={0} /> : null}
      <View style={styles.frame}>
        {geo ? <FrameDrawing geo={geo} t={t} /> : null}
        <Animated.View
          style={{ transformOrigin: '50% 100%', opacity: cardO, transform: [{ translateY: cardY }, { scaleX: cardSX }, { scaleY: cardSY }] }}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            if (Math.abs(w - size.w) > 1 || Math.abs(h - size.h) > 1) setSize({ w, h });
          }}>
          <View style={styles.cardShadow} />
          <CardSurface.Provider value={surface}>
            <CardNoType.Provider value>{renderCard(shown)}</CardNoType.Provider>
          </CardSurface.Provider>
        </Animated.View>
        {/* Over the vine, coming in with the card. */}
        <Animated.View style={[styles.locketAt, { opacity: cardO, transform: [{ scale: span(t, 100, 600, 0.4, 1, EASE.card) }] }]} pointerEvents="none">
          <Locket name={card.author.displayName} photo={card.author.photoUrl} clip={`locket-${card.id}`} />
        </Animated.View>
        {card.gifted ? (
          <Animated.View style={[styles.fruit, { transform: [{ scale: fruitPop }] }]}>
            <VineFruit label={tr('vine.fruit')} size={44} />
          </Animated.View>
        ) : null}
      </View>
      <View style={{ height: hang.H }}>
        <Svg aria-hidden pointerEvents="none" style={[styles.connSvg, { width, height: hang.H }]} width={width} height={hang.H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AnimatedPath d={hang.s2} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" {...strandDash(hang.l2)} />
          <AnimatedPath d={hang.s2} fill="none" stroke={BEANSTALK.strandLight} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" {...strandDash(hang.l2)} />
          <AnimatedPath d={hang.s1} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={9.5} strokeLinecap="round" strokeLinejoin="round" {...strandDash(hang.l1)} />
          <AnimatedPath d={hang.s1} fill="none" stroke={BEANSTALK.strand} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" {...strandDash(hang.l1)} />
          <AnimatedPath d={hang.stems} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={6.5} strokeLinecap="round" opacity={span(t, 1050, 300, 0, 1)} />
          <AnimatedPath d={hang.stems} fill="none" stroke={BEANSTALK.stem} strokeWidth={3.2} strokeLinecap="round" opacity={span(t, 1050, 300, 0, 1)} />
          <AnimatedPath d={hang.deco} fill={BEANSTALK.vineLeaf} stroke={BEANSTALK.vineInk} strokeWidth={1.7} opacity={span(t, 900, 300, 0, 1)} />
        </Svg>
        {hang.leaves.map((leaf) =>
          leaf.level === 1 ? (
            // The first time, on the post's clock after the stalk has grown; new ones on their own; those already out stay out.
            <Leaf key={leaf.comment.id} leaf={leaf} t={cyc > 0 && leaf.k >= 0 ? pageT : t} at={cyc > 0 && leaf.k >= 0 ? leaf.k * 100 : 1100 + Math.max(leaf.k, 0) * 180} onTap={onTap} />
          ) : (
            <Leaf key={leaf.comment.id} leaf={leaf} t={openT} at={0} onTap={onTap} />
          ),
        )}
        {hang.clump ? <Bunch x={hang.clump.x} y={hang.clump.y} size={0.7} lean={hang.clump.side} t={t} at={1000} go={go} onDone={spread} label={tr('beanstalk.cluster', { count: total })} hint={tr('beanstalk.clusterTap')} /> : null}
        {hang.pager ? <Bunch key={`more${hang.page}`} x={width / 2 + (next - shift)} y={hang.pgY - 30} size={0.45} t={cyc > 0 ? pageT : t} at={cyc > 0 ? 500 : 1500} go={0} onDone={more} label={tr('beanstalk.clusterMore')} hint={tr('beanstalk.clusterMore')} /> : null}
      </View>
      <Reader comment={reading} kids={kids} onClose={closeReader} />
    </View>
  );
});

// ---------------------------------------------------------------------------
// The feed

interface Verse {
  id: string;
  reference: string;
  text: string;
  translation: string | null;
}

/** `shift`/`next`: where this item, and the one after it, sit off the centre line (see postShift). */
type Item = { kind: 'post'; card: Card; index: number; shift: number; next: number } | { kind: 'verse'; verse: Verse; key: string; shift: number };

/** A plain piece of stalk, between a post and a verse. */
function Stalk({ width, h, shift }: { width: number; h: number; shift: number }) {
  const cx = width / 2;
  const strand = (amp: number, ph: number) => {
    const pts: number[][] = [];
    for (let y = 0; y <= h; y += 4) pts.push([cx + amp * Math.max(0, Math.min(1, y / 26, (h - y) / 26)) * Math.sin(y / 30 + ph), y]);
    return toD(pts);
  };
  return (
    <View style={{ width, height: h, alignSelf: 'center', transform: [{ translateX: shift }] }} pointerEvents="none">
      <Svg width={width} height={h} aria-hidden>
        <Path d={strand(5.5, Math.PI)} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={6.5} strokeLinecap="round" />
        <Path d={strand(5.5, Math.PI)} fill="none" stroke={BEANSTALK.strandLight} strokeWidth={3} strokeLinecap="round" />
        <Path d={strand(7, 0)} fill="none" stroke={BEANSTALK.vineInk} strokeWidth={9.5} strokeLinecap="round" />
        <Path d={strand(7, 0)} fill="none" stroke={BEANSTALK.strand} strokeWidth={5.5} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export function BeanstalkLayout({ cards, theme, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const tokens = useMemo(() => vineTokens(theme), [theme]);
  const { wording, t } = useLocale();
  // Drawn with the system font until these arrive.
  useFonts({ Alegreya_400Regular, Alegreya_400Regular_Italic, Alegreya_600SemiBold, Alegreya_700Bold, Alegreya_700Bold_Italic, HennyPenny_400Regular });
  const [lane, setLane] = useState(0);
  const bus = useMemo(() => makeDrawBus(), []);
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

  const width = frameWidth(lane);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const shifts = cards.map((c, i) => postShift(c.id, i, lane));
    cards.forEach((card, i) => {
      const shift = shifts[i]!;
      const verse = verses.length > 0 && tokens.leafEvery > 0 && (i + 1) % tokens.leafEvery === 0;
      // Into a verse the stalk runs straight down; otherwise it bends to the next post.
      out.push({ kind: 'post', card, index: i, shift, next: verse ? shift : (shifts[i + 1] ?? shift) });
      if (verse) {
        const n = Math.floor(i / tokens.leafEvery);
        out.push({ kind: 'verse', verse: verses[n % verses.length]!, key: `verse-${n}`, shift });
      }
    });
    return out;
  }, [cards, verses, tokens.leafEvery, lane]);

  const onScroll = useCallback(() => {
    // Posts that have just come onto the screen grow; those that have left reset.
    bus.emit();
    const now = Date.now();
    if (now - lastScroll.current > 1000) {
      lastScroll.current = now;
      nudgeBird.current();
    }
  }, [bus]);

  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === 'post' ? (
        <Post card={item.card} index={item.index} width={width} shift={item.shift} next={item.next} first={item.index === 0} renderCard={renderCard} />
      ) : (
        <View>
          <View style={[styles.verse, { width, transform: [{ translateX: item.shift }] }]} accessibilityRole="text">
            <Text style={styles.verseText}>“{item.verse.text}”</Text>
            <Text style={styles.verseRef}>
              {item.verse.reference}
              {item.verse.translation ? ` (${item.verse.translation})` : ''}
            </Text>
          </View>
          <Stalk width={width} h={60} shift={item.shift} />
        </View>
      ),
    [width, renderCard],
  );

  const banner = (
    <View style={styles.top}>
      <Svg aria-hidden width={34} height={34} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M17 32 C 17 22, 10 18, 12 8 C 13 3, 20 3, 20 9 C 20 13, 15 13, 16 9" fill="none" stroke={BEANSTALK.tendril} strokeWidth={3} strokeLinecap="round" />
        <Path d="M17 22 C 22 16, 30 16, 31 20 C 26 24, 21 24, 17 22 Z" fill="#8DBA5C" stroke={BEANSTALK.ink} strokeWidth={2} />
      </Svg>
      <View style={styles.brand}>
        <Text style={styles.brandTitle} accessibilityRole="header">
          {t('beanstalk.title')}
        </Text>
        <Text style={styles.brandSub}>{t('beanstalk.subtitle')}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityHint={t('beanstalk.climbHint')} onPress={() => list.current?.scrollToOffset({ offset: 0, animated: true })} style={styles.hint}>
        <Text style={styles.hintText}>{t('beanstalk.climb')}</Text>
      </Pressable>
    </View>
  );

  return (
    <DrawBusContext.Provider value={bus}>
      <View style={styles.fill} onLayout={(e) => setLane(Math.min(e.nativeEvent.layout.width, 760))}>
        {banner}
        <FlatList
          ref={list}
          data={items}
          keyExtractor={(it) => (it.kind === 'post' ? it.card.id : it.key)}
          renderItem={renderItem}
          extraData={width}
          ListHeaderComponent={header ? <View style={styles.headerPanel}>{header}</View> : <View style={styles.feedTop} />}
          ListFooterComponent={
            atEnd && cards.length > 0 ? (
              <View style={styles.ground}>
                <View style={styles.groundArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.hill1} />
                  <View style={styles.hill2} />
                  <View style={styles.groundStalk} />
                  <View style={styles.soil} />
                </View>
                <Text style={styles.groundTitle}>{t('beanstalk.ground')}</Text>
                <Text style={styles.groundSub}>{wording === 'neutral' ? t('vine.tip') : t('beanstalk.groundSub')}</Text>
                <Button small variant="ghost" label={t('vine.growMore')} onPress={onRefresh} />
              </View>
            ) : undefined
          }
          contentContainerStyle={styles.content}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          {...feedListTuning}
          maxToRenderPerBatch={2}
          onScroll={onScroll}
          // Every frame, so a post starts growing the moment it scrolls onto the screen.
          scrollEventThrottle={16}
        />
        {theme?.animations?.idleBird === false ? null : <IdleBird tokens={tokens} register={registerBird} />}
      </View>
    </DrawBusContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BEANSTALK.page },
  content: { paddingBottom: 120, width: '100%', maxWidth: 760, alignSelf: 'center' },
  headerPanel: { borderRadius: 18, backgroundColor: BEANSTALK.cream, padding: space.sm, marginTop: space.md, marginHorizontal: space.md, marginBottom: 76 },
  feedTop: { height: 76 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: BEANSTALK.cream,
    borderBottomWidth: 3,
    borderBottomColor: BEANSTALK.ink,
    shadowColor: BEANSTALK.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    zIndex: 10,
  },
  brand: { flex: 1 },
  brandTitle: { fontFamily: FONT.title, fontSize: 23, lineHeight: 26, color: BEANSTALK.ink },
  brandSub: { fontFamily: FONT.body, fontSize: 13, color: BEANSTALK.sub, marginTop: 2 },
  hint: { borderWidth: 2, borderColor: BEANSTALK.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: BEANSTALK.button },
  hintText: { fontFamily: FONT.semi, fontSize: 14, color: BEANSTALK.ink },
  lead: { position: 'absolute', top: -60, left: '50%', marginLeft: -30, width: 60, height: 60, zIndex: 2 },
  frame: { position: 'relative', zIndex: 1 },
  // The vine is drawn P beyond the post on every side, outside the card's own box.
  frameSvg: { position: 'absolute', left: -P, top: -P, zIndex: 2 },
  cardShadow: { position: 'absolute', left: 6, top: 7, right: -6, bottom: -7, borderRadius: 18, backgroundColor: BEANSTALK.ink },
  // Over the frame's top right corner.
  fruit: { position: 'absolute', top: -24, right: -20, zIndex: 4 },
  // The oval sits over the post's top left corner, a little inside it, so it stays on screen when the post sways left.
  locketAt: { position: 'absolute', left: 0, top: 0, zIndex: 3 },
  locket: { position: 'absolute', left: 10 - 25 * LOCKET_SCALE, top: 4 - 37 * LOCKET_SCALE, width: LOCKET_W, height: LOCKET_H, zIndex: 3 },
  locketText: { position: 'absolute', top: 37 * LOCKET_SCALE - 22, left: 0, right: 0, textAlign: 'center', lineHeight: 44, fontFamily: FONT.bold, fontSize: 22 * LOCKET_SCALE, color: BEANSTALK.ink },
  connSvg: { position: 'absolute', left: 0, top: 0 },
  leafAt: { position: 'absolute', zIndex: 2 },
  berries: { position: 'absolute', width: 30, height: 30, zIndex: 3 },
  bunchAt: { position: 'absolute', zIndex: 1 },
  bunchLeaf: { position: 'absolute' },
  bunchHint: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: 'Alegreya_400Regular_Italic', fontSize: 14, color: BEANSTALK.link },
  leafBody: { justifyContent: 'center', alignItems: 'center', paddingTop: 16, paddingBottom: 18 },
  leafBodySmall: { paddingTop: 4, paddingBottom: 6 },
  flip: { transform: [{ scaleX: -1 }] },
  leafName: { fontFamily: FONT.bold, color: COMMENT_TEXT, textAlign: 'center' },
  leafText: { fontFamily: FONT.body, color: COMMENT_TEXT, textAlign: 'center' },
  leafHint: { fontFamily: FONT.boldItalic, fontSize: 12, color: BEANSTALK.link, marginTop: 2, textAlign: 'center' },
  verse: { alignSelf: 'center', padding: space.md, borderRadius: 18, borderWidth: 3, borderColor: BEANSTALK.ink, backgroundColor: BEANSTALK.cream, gap: 4 },
  verseText: { fontFamily: FONT.italic, fontSize: 16, lineHeight: 23, color: COMMENT_TEXT },
  verseRef: { fontFamily: FONT.body, fontSize: 13, color: BEANSTALK.sub },
  ground: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, paddingBottom: 60, alignItems: 'center', gap: 4 },
  groundArt: {
    width: '100%',
    height: 150,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: BEANSTALK.ink,
    borderRadius: 18,
    backgroundColor: BEANSTALK.sky,
    shadowColor: BEANSTALK.ink,
    shadowOffset: { width: 6, height: 7 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  hill1: { position: 'absolute', left: '-20%', right: '30%', bottom: '-70%', height: '140%', borderRadius: 999, backgroundColor: BEANSTALK.hill, borderWidth: 3, borderColor: BEANSTALK.ink },
  hill2: { position: 'absolute', left: '35%', right: '-25%', bottom: '-80%', height: '140%', borderRadius: 999, backgroundColor: BEANSTALK.hillDark, borderWidth: 3, borderColor: BEANSTALK.ink },
  soil: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 26, backgroundColor: BEANSTALK.soil, borderTopWidth: 3, borderTopColor: BEANSTALK.ink },
  groundStalk: { position: 'absolute', left: '50%', marginLeft: -7, top: 0, bottom: 22, width: 14, backgroundColor: BEANSTALK.stem, borderWidth: 2.5, borderColor: BEANSTALK.ink },
  groundTitle: { fontFamily: FONT.title, fontSize: 24, marginTop: 20, color: BEANSTALK.ink, textAlign: 'center' },
  groundSub: { fontFamily: FONT.body, fontSize: 16, color: BEANSTALK.sub, textAlign: 'center' },
  bigScrim: { flex: 1, backgroundColor: 'rgba(31,26,20,.55)', alignItems: 'center', justifyContent: 'center' },
  // The whole comment on a plain cream card with a vine-green edge, sized to its words.
  bigLeaf: { width: '90%', maxWidth: 520, maxHeight: '70%', backgroundColor: BEANSTALK.cream, borderRadius: 18, borderWidth: 3, borderColor: BEANSTALK.vineInk, paddingTop: 52 },
  bigScroll: { flexGrow: 0 },
  bigInner: { paddingHorizontal: 18, paddingBottom: 18 },
  bigClose: { position: 'absolute', right: 8, top: 8, width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: BEANSTALK.ink, backgroundColor: '#F3E3B8', alignItems: 'center', justifyContent: 'center' },
  bi: { marginBottom: 14 },
  bi0: { fontSize: 19 },
  bi1: { marginLeft: 20, paddingLeft: 12, borderLeftWidth: 4, borderLeftColor: BEANSTALK.stem },
  bi2: { marginLeft: 20, paddingLeft: 12, borderLeftWidth: 4, borderLeftColor: BEANSTALK.strandLight },
  biName: { fontFamily: FONT.bold, fontSize: 15, color: BEANSTALK.ink },
  biText: { fontFamily: FONT.body, fontSize: 17, lineHeight: 25, color: BEANSTALK.ink, marginTop: 2 },
});
