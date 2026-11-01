// Ceramic Figurines (beta, behind Admin → Feed skins), Steve 2026-10-31. The "elegant retired
// lady version", drawn from the Claude Design canvas "Ceramic Figurine Skin":
//   * Pastels and light colors, nonglaring unglazed ceramic. Each post is a matte ceramic
//     plaque with an etched edge, set in a shadow box, standing on a ceramic platform.
//   * Angels are the workmen: hanging from fancy ropes and a shiny white pulley under a
//     cloud, each platform is hauled up toward heaven by an angel pulling hand over hand.
//     At the post in the middle of the screen the angel stops, turns and presents it, like
//     a game-show host showing the prizes.
//   * Little childlike statuettes with angel wings (original drawings, five styles; members
//     pick their own, or all five mixed). A still statue points at every third post.
//   * Comments hang under the platform on ceramic placards tied together. Closed, only the
//     first comment's first line shows, the others stacked behind it; a tap flops them all
//     down, a tap on a comment folds them back up. Under every comment with replies its
//     first reply hangs showing; a tap flops the rest down, a tap on a reply folds them.
//     Replies get no Reply button (Steve: overnesting is hard to follow).
//   * Occasional clouds; now and then an angel flies from a post leaving the screen to the
//     centred one, and a ceramic turtle walks slowly across behind the cards.
// Plaques and placards grow with their text. Reduced motion keeps everything still.
// Buttons, comments and paging come from the shared skin hooks (docs/SKIN_HOOKS.md).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Card, Comment, FeedTheme } from '@prayer-tower/shared';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { DancingScript_600SemiBold } from '@expo-google-fonts/dancing-script/600SemiBold';
import { useFonts } from 'expo-font';

import { CardNameFont, CardSurface } from '@/components/post-card';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { useCommentActions, useCommentCluster, usePostComments } from '@/skins/comments';
import { useFeedHooks } from '@/skins/feed-hooks';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';

/** People's names: a fancy, feminine, almost-cursive script, like on pastel greeting cards (Steve 2026-11-01). */
export const NAME_FONT = 'DancingScript_600SemiBold';

const DEFAULTS = {
  backdrop: '#EAE6F1',
  frame: '#F1E4DF',
  recess: '#E5DAD5',
  platform: '#EADDD7',
  placard: '#F7F1EE',
  reply: '#E6DEF0',
  ink: '#4B3F47',
};
type CeramicTokens = typeof DEFAULTS;

export function ceramicTokens(theme: FeedTheme | null): CeramicTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof t[k] === typeof v) out[k] = t[k];
  return out as CeramicTokens;
}

/** The plaques' pastel glazes, by turns: powder blue, blush, mint, butter, lilac. */
export const PLAQUE_TINTS = ['#DCE6EF', '#F3DDD7', '#DDEADF', '#F2EBD2', '#E6DEF0'];
/** Muted text on the ceramic (names, times): readable on every tint. */
export const MUTED = '#5E4F58';

export const LOOKS = ['angel', 'garden', 'shepherd', 'choir', 'dove'] as const;
export type Look = (typeof LOOKS)[number];
export type LookChoice = Look | 'mix';
const LOOK_KEY = 'ceramic.figurines';

/** Which figurine stands at a post: the member's style, or the five by turns. `slot` 0 is the angel hauling, 1 the pointing statue. */
export function lookFor(choice: LookChoice, index: number, slot: 0 | 1): Look {
  return choice === 'mix' ? LOOKS[(index * 2 + slot) % LOOKS.length]! : choice;
}
/** A still statue points at every third post (the second, fifth, ...). */
export function pointerAt(index: number, every = 3) {
  return index % every === 1;
}
/** The hauling angel works on the left at even posts and on the right at odd ones. */
export function angelSide(index: number): 'left' | 'right' {
  return index % 2 === 0 ? 'left' : 'right';
}

/** How tall the band of sky above each platform is: cloud, pulley, the angel and the ropes. */
export const TOP = 112;
const FIG_W = 46;
const FIG_H = 77;
const ROPE_IN = 38;
const BOX_IN = 50;
const PLATFORM_IN = 26;

/**
 * The ropes for a row `w` wide: the hauling rope from the pulley down to the angel's hands
 * (and its tasselled tail), the load rope from the pulley down to the ring, and the bridle
 * from the ring out to the two side ropes that hold the platform.
 */
export function ropeGeometry(side: 'left' | 'right', w: number) {
  const cx = w / 2;
  const r = 13;
  const left = side === 'left';
  // The angel's front hand, in row points (the figurine is FIG_W × FIG_H; its hand sits at 82%, 38%).
  const angelX = left ? 4 : w - 4 - FIG_W;
  const handX = left ? angelX + FIG_W * 0.82 : angelX + FIG_W * 0.18;
  const handY = 22 + FIG_H * 0.38;
  const haulFrom = left ? cx - r : cx + r;
  const loadX = left ? cx + r - 1 : cx - r + 1;
  const tailX = left ? handX - 6 : handX + 6;
  const ropeL = ROPE_IN + 2;
  const ropeR = w - ROPE_IN - 2;
  return {
    cx,
    angelX,
    pointX: left ? w - 4 - FIG_W : 4,
    handX,
    handY,
    loadX,
    haul: `M${haulFrom} 27 L${handX.toFixed(1)} ${handY.toFixed(1)} L${tailX.toFixed(1)} ${(handY + 3.5).toFixed(1)}`,
    tail: `M${tailX.toFixed(1)} ${(handY + 3.5).toFixed(1)} Q${(left ? tailX - 7 : tailX + 7).toFixed(1)} ${(handY + 14).toFixed(1)} ${(left ? tailX - 3 : tailX + 3).toFixed(1)} ${(handY + 26).toFixed(1)}`,
    tassel: `M${(left ? tailX - 3 : tailX + 3).toFixed(1)} ${(handY + 25).toFixed(1)} l-3.5 9 h7 Z`,
    load: `M${loadX} 27 V84`,
    bridle: `M${loadX} 92 L${ropeL} ${TOP} M${loadX} 92 L${ropeR} ${TOP}`,
    ropeL,
    ropeR,
  };
}

/** Initials for an oval until the member adds a photo. */
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

const CLOUD = 'M16 44h96a14 14 0 0 0-3-27.5A21 21 0 0 0 72 9a17 17 0 0 0-30 7A13.5 13.5 0 0 0 16 44Z';
const ROPE = '#D9AF88';
const ROPE_LIGHT = '#F6E7D3';

// ---------------------------------------------------------------------------
// The figurines: big heads, little bodies, rosy cheeks and angel wings, on a ceramic base.

const DRESS: Record<Look, [string, string]> = {
  angel: ['#D3DFEC', '#95ABC4'],
  garden: ['#D3E6D6', '#93B39A'],
  shepherd: ['#E6D6B9', '#B9A37A'],
  choir: ['#DCCFEA', '#A794C2'],
  dove: ['#F1D7D3', '#C99F98'],
};
const SKIN = '#F7E6D8';
const SKIN_LINE = '#B8957F';
const EYE = '#45363B';

export type Pose = 'pull' | 'present' | 'point' | 'sit';

export function Figurine({ look, pose, flip = false, width = FIG_W, height = FIG_H }: { look: Look; pose: Pose; flip?: boolean; width?: number; height?: number }) {
  const [dress, line] = DRESS[look];
  const sit = pose === 'sit';
  const dy = sit ? 12 : 0;
  // Turned to the side and leaning in to present; leaning back to haul.
  const turn = pose === 'present' ? 'translate(3 9) scale(0.9 1) rotate(3 30 94)' : pose === 'pull' ? 'rotate(-6 30 94)' : '';
  const free = pose !== 'pull';
  return (
    <Svg width={width} height={height} viewBox="0 0 60 100" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <G transform={flip ? 'translate(60 0) scale(-1 1)' : undefined}>
        <Rect x={8} y={94} width={44} height={4.5} rx={1.5} fill="#DCCFC4" stroke="#A89788" strokeWidth={0.7} />
        <Ellipse cx={30} cy={94} rx={22} ry={3.6} fill="#EFE6DE" stroke="#A89788" strokeWidth={0.7} />
        <G transform={turn}>
          {/* Wings, on every figurine. */}
          <G transform={`translate(0 ${dy})`}>
            <Path d="M23 59C9 50 4 66 12 76c4-4 9-8 13-10Z" fill="#FBF8F3" stroke="#A8968A" strokeWidth={0.9} />
            <Path d="M37 59c14-9 19 7 11 17-4-4-9-8-13-10Z" fill="#FBF8F3" stroke="#A8968A" strokeWidth={0.9} />
            <Path d="M12 66c3 1 6 1 10-1M14 71c2 0 5-1 8-3M48 66c-3 1-6 1-10-1M46 71c-2 0-5-1-8-3" fill="none" stroke="#C4B5AA" strokeWidth={0.8} />
          </G>
          {sit ? (
            <G>
              <Ellipse cx={24} cy={92} rx={5} ry={2.6} fill="#B9A0B2" />
              <Ellipse cx={36} cy={92} rx={5} ry={2.6} fill="#B9A0B2" />
              <Path d="M17 72Q30 60 43 72L47 91Q30 95 13 91Z" fill={dress} stroke={line} strokeWidth={0.9} />
              <Path d="M20 70Q19.5 78 27 79M40 70Q40.5 78 33 79" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
              <Path d="M27.4 80 30 68.6 32.6 80Z" fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.8} strokeLinejoin="round" />
              {look === 'shepherd' ? (
                <G>
                  <Ellipse cx={49} cy={87.5} rx={8.5} ry={5.2} fill="#FBF8F3" stroke="#B5A79B" strokeWidth={0.9} />
                  <Circle cx={55.2} cy={82.6} r={3.6} fill="#EFE3D9" stroke="#B19F91" strokeWidth={0.8} />
                </G>
              ) : null}
            </G>
          ) : (
            <G>
              {look === 'shepherd' && free ? <Path d="M19 98V66c0-6 3-8 6-8 3 0 4 2 4 4.5" fill="none" stroke="#C4A88A" strokeWidth={2.2} strokeLinecap="round" /> : null}
              <Ellipse cx={25} cy={92} rx={5} ry={2.8} fill="#B9A0B2" />
              <Ellipse cx={35} cy={92} rx={5} ry={2.8} fill="#B9A0B2" />
              <Path d="M22 54Q30 50 38 54L44 89Q30 93 16 89Z" fill={dress} stroke={line} strokeWidth={0.9} />
              <Path d="M21 78Q30 81 39 78" fill="none" stroke={line} strokeWidth={0.8} />
              {pose === 'pull' ? (
                <G>
                  {/* Both hands up on the rope. */}
                  <Path d="M23.5 58Q33 52 42.5 44" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={43.5} cy={43} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                  <Path d="M36.5 58Q43 50 48.5 40" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={49.5} cy={38.5} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                </G>
              ) : (
                <G>
                  <Path d="M23.5 58Q17.5 67 19 76" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={19} cy={77.5} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                  {pose === 'point' ? (
                    <G>
                      <Path d="M36.5 58Q45.5 56 53 52.5" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                      <Circle cx={54.5} cy={52} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                      <Path d="M56.5 51.2 59.6 50" fill="none" stroke="#F0D9C8" strokeWidth={2} strokeLinecap="round" />
                    </G>
                  ) : (
                    // Presenting: the arm stretched out, palm up.
                    <G>
                      <Path d="M36.5 58Q46 57 55 56" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                      <Ellipse cx={57} cy={55.5} rx={3.8} ry={2.3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                    </G>
                  )}
                </G>
              )}
              {look === 'garden' && free ? <Circle cx={18.5} cy={81} r={3.2} fill="#F2C4CF" stroke="#D99AAA" strokeWidth={0.6} /> : null}
              {look === 'choir' && free ? <Rect x={13} y={73} width={9.5} height={11} rx={1} fill="#CDBDDC" stroke="#8E78A6" strokeWidth={0.7} /> : null}
              {look === 'dove' && free ? <Ellipse cx={17} cy={80} rx={6} ry={3.4} fill="#FFFFFF" stroke="#9E8E97" strokeWidth={0.8} /> : null}
            </G>
          )}
          {look === 'choir' ? <Ellipse cx={30} cy={52.5 + dy} rx={9} ry={3} fill="#FFFDF8" stroke="#B9ACA1" strokeWidth={0.8} /> : null}
          <G transform={`translate(0 ${dy})`}>
            <Circle cx={30} cy={34} r={17} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.9} />
            {pose === 'sit' ? (
              <Path d="M22.5 36q2.5 2.2 5 0M32.5 36q2.5 2.2 5 0" fill="none" stroke={EYE} strokeWidth={1.1} strokeLinecap="round" />
            ) : (
              <G>
                <Ellipse cx={32.5} cy={35.5} rx={1.6} ry={2.2} fill={EYE} />
                <Ellipse cx={40} cy={35.5} rx={1.6} ry={2.2} fill={EYE} />
              </G>
            )}
            <Path d={pose === 'present' ? 'M33.5 42q2.8 2.4 5.6 0' : 'M33.5 42.5q2 1.5 4 0'} fill="none" stroke="#A0716B" strokeWidth={0.9} strokeLinecap="round" />
            <Circle cx={22} cy={40.5} r={2.6} fill="#F2B4AA" opacity={0.55} />
            <Circle cx={40} cy={40.5} r={2.6} fill="#F2B4AA" opacity={0.55} />
            {look === 'angel' ? (
              <G>
                <Path d="M13 33Q12 16 30 16Q48 16 47 33Q44 25 37 24Q34 27 30 24Q26 27 23 24Q16 25 13 33Z" fill="#EFDCAE" stroke="#C2A66A" strokeWidth={0.8} />
                <Ellipse cx={30} cy={11} rx={11} ry={2.8} fill="none" stroke="#C9A75E" strokeWidth={1.8} />
              </G>
            ) : look === 'garden' ? (
              <G>
                <Path d="M14 37Q12 23 20 20H40Q48 23 46 37Q44 31 42 29H18Q16 31 14 37Z" fill="#C9A48C" />
                <Path d="M16 25Q17 11 30 11Q43 11 44 25Z" fill="#F4D9D3" stroke="#BF9A91" strokeWidth={0.8} />
                <Ellipse cx={30} cy={25} rx={21} ry={5} fill="#F4D9D3" stroke="#BF9A91" strokeWidth={0.8} />
              </G>
            ) : look === 'shepherd' ? (
              <G>
                <Path d="M12 36Q12 14 30 14Q48 14 48 36L46 48Q44 30 30 27Q16 30 14 48Z" fill="#EFE6CB" stroke="#B8A678" strokeWidth={0.8} />
                <Path d="M14 28Q30 22 46 28" fill="none" stroke="#C9B184" strokeWidth={2} />
              </G>
            ) : look === 'choir' ? (
              <Path d="M13 34Q12 16 30 16Q48 16 47 34Q46 26 41 24Q36 28 30 25Q24 28 19 24Q14 26 13 34Z" fill="#C9A48C" stroke="#97735D" strokeWidth={0.8} />
            ) : (
              <G>
                <Circle cx={12} cy={31} r={4.6} fill="#A8826C" stroke="#8A6753" strokeWidth={0.8} />
                <Circle cx={48} cy={31} r={4.6} fill="#A8826C" stroke="#8A6753" strokeWidth={0.8} />
                <Path d="M13 33Q12 16 30 16Q48 16 47 33Q45 25 38 23Q30 27 22 23Q15 25 13 33Z" fill="#A8826C" stroke="#8A6753" strokeWidth={0.8} />
              </G>
            )}
          </G>
        </G>
      </G>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Motion helpers.

/** A value looping 0 → 1 forever (paused at 0 under reduced motion or while `run` is false). */
function useLoop(ms: number, run: boolean, reduced: boolean, ease: 'linear' | 'swing' = 'swing') {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced || !run) {
      v.stopAnimation();
      return;
    }
    const easing = ease === 'linear' ? Easing.linear : Easing.inOut(Easing.sin);
    const anim =
      ease === 'linear'
        ? Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing, useNativeDriver: Platform.OS !== 'web' }))
        : Animated.loop(
            Animated.sequence([
              Animated.timing(v, { toValue: 1, duration: ms / 2, easing, useNativeDriver: Platform.OS !== 'web' }),
              Animated.timing(v, { toValue: 0, duration: ms / 2, easing, useNativeDriver: Platform.OS !== 'web' }),
            ]),
          );
    anim.start();
    return () => anim.stop();
  }, [ms, run, reduced, ease, v]);
  return v;
}

/** Folds a placard down from its tie, like a plaque on a string flopping open. */
function Flop({ delay, children, testID }: { delay: number; children: ReactNode; testID?: string }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, { toValue: 1, duration: 760, delay, easing: Easing.bezier(0.3, 1.25, 0.5, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [reduced, delay, v]);
  return (
    <Animated.View
      testID={testID}
      style={{
        transformOrigin: 'top',
        opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [{ perspective: 700 }, { rotateX: v.interpolate({ inputRange: [0, 1], outputRange: ['-100deg', '0deg'] }) }],
      }}>
      {children}
    </Animated.View>
  );
}

/** Two short ropes tying a placard to the one above it. */
function Ties({ inset = 34, height = 12 }: { inset?: number; height?: number }) {
  return (
    <View pointerEvents="none" aria-hidden style={{ height }}>
      <View style={[styles.tie, { left: inset, height }]} />
      <View style={[styles.tie, { right: inset, height }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Comments on ceramic placards.

function CommentButtons({ postId, comment, canReply }: { postId: string; comment: Comment; canReply: boolean }) {
  const { reply, helped, share } = useCommentActions(postId, comment);
  const pill = (key: string, b: { name: string; press: () => void; on?: boolean }) => (
    <Pressable key={key} onPress={b.press} accessibilityRole="button" aria-pressed={key === 'helped' ? !!b.on : undefined} style={[styles.pill, b.on && styles.pillOn]}>
      <Text style={styles.pillText}>{b.name}</Text>
    </Pressable>
  );
  return (
    <View style={styles.pills}>
      {canReply ? pill('reply', reply) : null}
      {helped ? pill('helped', helped) : null}
      {share ? pill('share', share) : null}
    </View>
  );
}

/** The etched line just inside a ceramic edge. */
function Etch({ inset = 4, radius = 7 }: { inset?: number; radius?: number }) {
  return <View pointerEvents="none" aria-hidden style={[styles.etch, { top: inset, left: inset, right: inset, bottom: inset, borderRadius: radius }]} />;
}

/** A comment's replies: the first one hangs showing; a tap flops the rest down, a tap on one folds them. */
function Replies({ postId, list, kids, open, onToggle, tokens }: { postId: string; list: Comment[]; kids: Map<string, Comment[]>; open: boolean; onToggle: () => void; tokens: CeramicTokens }) {
  const { t } = useLocale();
  if (!list.length) return null;
  const first = list[0]!;
  if (!open)
    return (
      <View style={styles.replyStack}>
        <Ties inset={26} height={10} />
        {list.length > 1 ? <View pointerEvents="none" aria-hidden style={[styles.replyBehind, { backgroundColor: '#D9CFE6' }]} /> : null}
        <Pressable
          testID={`ceramic-first-${first.parentId}`}
          accessibilityRole="button"
          aria-expanded={false}
          accessibilityLabel={t('ceramic.showReplies', { count: list.length })}
          onPress={onToggle}
          style={[styles.replyCard, { backgroundColor: tokens.reply }]}>
          <Etch inset={4} radius={6} />
          <Text style={styles.oneLine} numberOfLines={1}>
            <Text style={styles.replyName}>{first.author.displayName}</Text> · {first.body}
          </Text>
          {list.length > 1 ? <Text style={styles.more}>+{list.length - 1}</Text> : null}
        </Pressable>
      </View>
    );
  return (
    <View style={styles.replyStack}>
      {list.map((r, i) => (
        <Flop key={r.id} delay={i * 140} testID={`ceramic-reply-${r.id}`}>
          <Ties inset={26} height={10} />
          <View style={[styles.replyCard, styles.replyOpen, { backgroundColor: tokens.reply }]}>
            <Etch inset={4} radius={6} />
            <Pressable accessibilityRole="button" accessibilityLabel={t('ceramic.foldReplies', { name: r.author.displayName })} onPress={onToggle}>
              <Text style={styles.replyName}>{r.author.displayName}</Text>
              <Text style={styles.replyText}>{r.body}</Text>
              {/* A reply's own replies, smaller, under it. */}
              {(kids.get(r.id) ?? []).map((rr) => (
                <View key={rr.id} style={styles.subReply}>
                  <Text style={styles.subName}>{rr.author.displayName}</Text>
                  <Text style={styles.subText}>{rr.body}</Text>
                </View>
              ))}
            </Pressable>
            {/* Steve: sub-comments get no Reply button. */}
            <CommentButtons postId={postId} comment={r} canReply={false} />
          </View>
        </Flop>
      ))}
    </View>
  );
}

/** How many comments flop down from a post; the rest open on the post's own page. */
export const PLACARDS_SHOWN = 5;

const Placards = memo(function Placards({ card, tokens }: { card: Card; tokens: CeramicTokens }) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const { top, kids, total } = usePostComments(card);
  const { state, toggle, toggleReplies } = useCommentCluster();
  if (!top.length) return null;
  const first = top[0]!;
  if (!state.spread)
    return (
      <View style={styles.placards}>
        <Ties />
        {total > 1 ? <View pointerEvents="none" aria-hidden style={[styles.behind, styles.behindBack]} /> : null}
        {total > 1 ? <View pointerEvents="none" aria-hidden style={[styles.behind, styles.behindMid]} /> : null}
        <Pressable
          testID={`ceramic-stack-${card.id}`}
          accessibilityRole="button"
          aria-expanded={false}
          accessibilityLabel={t('ceramic.showComments', { count: total })}
          onPress={toggle}
          style={[styles.placard, styles.placardClosed, { backgroundColor: tokens.placard }, total > 1 && { marginBottom: 12 }]}>
          <Etch />
          <View style={styles.smallOval}>
            <Text style={styles.smallOvalText}>{initials(first.author.displayName)}</Text>
          </View>
          <Text style={styles.oneLine} numberOfLines={1}>
            <Text style={styles.placardNameInline}>{first.author.displayName}</Text> · {first.body}
          </Text>
          {total > 1 ? <Text style={styles.more}>+{total - 1}</Text> : null}
        </Pressable>
      </View>
    );
  const shown = top.slice(0, PLACARDS_SHOWN);
  const more = total - shown.length;
  return (
    <View style={styles.placards}>
      {shown.map((c, i) => (
        <Flop key={c.id} delay={i * 140} testID={`ceramic-comment-${c.id}`}>
          <Ties />
          <View style={[styles.placard, { backgroundColor: tokens.placard }]}>
            <Etch />
            <Pressable accessibilityRole="button" accessibilityLabel={t('ceramic.foldComments', { name: c.author.displayName })} onPress={toggle}>
              <View style={styles.placardHead}>
                <View style={styles.smallOval}>
                  <Text style={styles.smallOvalText}>{initials(c.author.displayName)}</Text>
                </View>
                <Text style={styles.placardName}>{c.author.displayName}</Text>
              </View>
              <Text style={styles.placardText}>{c.body}</Text>
            </Pressable>
            <CommentButtons postId={card.id} comment={c} canReply />
          </View>
          <Replies postId={card.id} list={kids.get(c.id) ?? []} kids={kids} open={state.open === i} onToggle={() => toggleReplies(1, i)} tokens={tokens} />
        </Flop>
      ))}
      {more > 0 ? (
        <Flop delay={shown.length * 140}>
          <Pressable accessibilityRole="button" onPress={() => openPost(card.id)} style={styles.pebble}>
            <Text style={styles.pebbleText}>{t('ceramic.more', { n: more })}</Text>
          </Pressable>
        </Flop>
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// One post: the sky with its cloud and pulley, the angels, the platform and its placards.

const PostRow = memo(function PostRow({
  card,
  index,
  width,
  tokens,
  look,
  present,
  pinned,
  renderCard,
}: {
  card: Card;
  index: number;
  width: number;
  tokens: CeramicTokens;
  look: LookChoice;
  present: boolean;
  pinned: boolean;
  renderCard: FeedLayoutProps['renderCard'];
}) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const side = angelSide(index);
  const g = useMemo(() => ropeGeometry(side, width), [side, width]);
  const run = !present;
  const spin = useLoop(2400, run, reduced, 'linear');
  const haul = useLoop(1600, run, reduced);
  const tint = PLAQUE_TINTS[index % PLAQUE_TINTS.length]!;
  const plaque = useMemo(() => ({ ...styles.plaque, backgroundColor: tint }), [tint]);
  const pointer = pointerAt(index);
  const cloudBehind = index % 5 === 1 || index % 5 === 3;
  return (
    <View style={styles.row} testID={`ceramic-${card.id}`}>
      {cloudBehind ? (
        <Svg width={130} height={50} viewBox="0 0 130 50" style={[styles.cloudBehind, index % 2 ? { right: -48 } : { left: -48 }]} aria-hidden pointerEvents="none">
          <Path d={CLOUD} fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.2} />
        </Svg>
      ) : null}
      <Svg width={width} height={TOP} style={styles.sky} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
        <Path d={CLOUD} transform={`translate(${g.cx - 64} -18) scale(1)`} fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.2} />
        <Rect x={g.cx - 4} y={12} width={8} height={14} rx={2} fill="#FFFFFF" stroke="#B9AEB6" strokeWidth={1} />
        <Path d={g.haul} fill="none" stroke={ROPE} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={g.haul} fill="none" stroke={ROPE_LIGHT} strokeWidth={3.4} strokeDasharray="2.2 2.8" />
        <Path d={g.tail} fill="none" stroke={ROPE} strokeWidth={3} strokeLinecap="round" />
        <Path d={g.tassel} fill="#EBC6D0" stroke="#B88E9A" strokeWidth={0.9} />
        <Path d={g.load} fill="none" stroke={ROPE} strokeWidth={3.4} strokeLinecap="round" />
        <Path d={g.load} fill="none" stroke={ROPE_LIGHT} strokeWidth={3.4} strokeDasharray="2.2 2.8" />
        <Path d={g.bridle} fill="none" stroke={ROPE} strokeWidth={2.6} strokeLinecap="round" />
        <Path d={g.bridle} fill="none" stroke={ROPE_LIGHT} strokeWidth={2.6} strokeDasharray="2 2.6" />
        <Circle cx={g.loadX} cy={88} r={4} fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
        <Circle cx={g.loadX} cy={88} r={4} fill="none" stroke="#A99DA6" strokeWidth={0.6} />
        {/* The shiny white pulley. */}
        <Circle cx={g.cx} cy={26} r={13} fill="#F9F8FA" stroke="#A99DA6" strokeWidth={1.2} />
        <Circle cx={g.cx} cy={26} r={9.5} fill="#FFFFFF" stroke="#DCD5DA" strokeWidth={1.6} />
        {/* The little clouds the figurines stand on. */}
        <Path d={`M${g.angelX - 2} 106h50a8 8 0 0 0-2-15.5 12 12 0 0 0-22-3 9 9 0 0 0-16 5A7.5 7.5 0 0 0 ${g.angelX - 2} 106Z`} fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.1} />
        {pointer ? <Path d={`M${g.pointX - 2} 106h50a8 8 0 0 0-2-15.5 12 12 0 0 0-22-3 9 9 0 0 0-16 5A7.5 7.5 0 0 0 ${g.pointX - 2} 106Z`} fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.1} /> : null}
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[styles.spokes, { left: g.cx - 9, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] }) }] }]}>
        <Svg width={18} height={18} viewBox="-9 -9 18 18" aria-hidden>
          <Path d="M0 -8.5v17M-8.5 0h17M-6 -6l12 12M6 -6l-12 12" stroke="#CFC6CC" strokeWidth={1.3} strokeLinecap="round" />
          <Circle cx={0} cy={0} r={3} fill="#EBD9A6" stroke="#B89F62" strokeWidth={0.8} />
        </Svg>
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        testID={present ? 'ceramic-presenting' : undefined}
        style={[styles.figure, { left: g.angelX, transform: [{ translateY: haul.interpolate({ inputRange: [0, 1], outputRange: [0, 2.5] }) }] }]}>
        <Figurine look={lookFor(look, index, 0)} pose={present ? 'present' : 'pull'} flip={side === 'right'} />
      </Animated.View>
      {pointer ? (
        <View pointerEvents="none" style={[styles.figure, { left: g.pointX }]}>
          <Figurine look={lookFor(look, index, 1)} pose="point" flip={side === 'left'} />
        </View>
      ) : null}
      <Animated.View style={{ transform: [{ translateY: haul.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}>
        <View style={styles.hung}>
          <View pointerEvents="none" aria-hidden style={[styles.sideRope, { left: ROPE_IN }]} />
          <View pointerEvents="none" aria-hidden style={[styles.sideRope, { right: ROPE_IN }]} />
          {pinned ? <Text style={styles.pinned}>{t('feed.pinned')}</Text> : null}
          {/* The shadow box: a raised ceramic frame round a deep recess, the plaque inside it. */}
          <View style={[styles.frame, { backgroundColor: tokens.frame }]}>
            <View style={[styles.recess, { backgroundColor: tokens.recess }]}>
              <CardNameFont.Provider value={NAME_FONT}>
                <CardSurface.Provider value={plaque}>{renderCard(card.counts.comments > 0 ? { ...card, topComment: null } : card)}</CardSurface.Provider>
              </CardNameFont.Provider>
            </View>
          </View>
          {/* The platform it stands on. */}
          <View pointerEvents="none" aria-hidden style={styles.platform}>
            <View style={styles.platformTop} />
            <View style={[styles.platformFront, { backgroundColor: tokens.platform }]}>
              <Etch inset={3} radius={5} />
            </View>
            <View style={[styles.knob, { left: 10 }]} />
            <View style={[styles.knob, { right: 10 }]} />
          </View>
        </View>
        <Placards card={card} tokens={tokens} />
      </Animated.View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// The turtle and the flying angel, and the figurine picker.

function Turtle({ width, reduced }: { width: number; reduced: boolean }) {
  const walk = useLoop(46000, true, reduced, 'linear');
  const step = useLoop(1600, true, reduced);
  if (reduced) return null;
  // It crosses in the first 55% of the loop and rests off screen for the rest.
  const x = walk.interpolate({ inputRange: [0, 0.55, 1], outputRange: [-80, width + 10, width + 10] });
  return (
    <Animated.View pointerEvents="none" testID="ceramic-turtle" style={[styles.turtle, { transform: [{ translateX: x }, { translateY: step.interpolate({ inputRange: [0, 1], outputRange: [0, -0.8] }) }] }]}>
      <Svg width={64} height={36} viewBox="0 0 64 36" aria-hidden>
        <Ellipse cx={31} cy={33} rx={25} ry={2.4} fill="#5A4652" opacity={0.15} />
        <Ellipse cx={18} cy={28} rx={4} ry={5} fill="#CFE0D2" stroke="#7F9F88" strokeWidth={0.9} />
        <Ellipse cx={44} cy={28} rx={4} ry={5} fill="#CFE0D2" stroke="#7F9F88" strokeWidth={0.9} />
        <Path d="M8 23.5 3 26.5 9 26.5Z" fill="#CFE0D2" stroke="#7F9F88" strokeWidth={0.9} />
        <Circle cx={56} cy={19} r={6.2} fill="#D6E5D8" stroke="#7F9F88" strokeWidth={0.9} />
        <Ellipse cx={58.2} cy={17.4} rx={0.9} ry={1.2} fill={EYE} />
        <Path d="M9 25Q11 5 31 4.5Q51 5 53 25Z" fill="#CBE0D0" stroke="#7F9F88" strokeWidth={1} />
        <Path d="M25 11h12l4 7-4 7H25l-4-7Z M25 11 19 9M37 11l6-2M41 18h10M21 18H11" fill="none" stroke="#93B39C" strokeWidth={0.9} strokeLinejoin="round" />
        <Path d="M8 25.5H54" stroke="#ECDFC8" strokeWidth={3.2} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/** An angel flying in from the edge a post just left, to the centred post. */
function Flyer({ from, side, height, width, onDone }: { from: 'top' | 'bottom'; side: 'left' | 'right'; height: number; width: number; onDone: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }).start(onDone);
  }, [v, onDone]);
  const x0 = side === 'left' ? 8 : width - 48;
  const mid = side === 'left' ? 80 : width - 120;
  const y0 = from === 'top' ? -20 : height;
  const y1 = height * 0.45;
  return (
    <Animated.View
      pointerEvents="none"
      testID="ceramic-flyer"
      style={[
        styles.flyer,
        {
          opacity: v.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [x0, mid, x0 + (side === 'left' ? 8 : -8)] }) },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y0, y1] }) },
            { rotate: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-8deg', '8deg', '0deg'] }) },
          ],
        },
      ]}>
      <Figurine look="angel" pose="present" flip={side === 'right'} width={40} height={67} />
    </Animated.View>
  );
}

function Picker({ visible, choice, onPick, onClose }: { visible: boolean; choice: LookChoice; onPick: (c: LookChoice) => void; onClose: () => void }) {
  const { t } = useLocale();
  const options: LookChoice[] = ['mix', ...LOOKS];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.sheet} accessibilityViewIsModal>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          {t('ceramic.pickTitle')}
        </Text>
        <Text style={styles.sheetSub}>{t('ceramic.pickSub')}</Text>
        <View style={styles.grid}>
          {options.map((o) => (
            <Pressable
              key={o}
              testID={`ceramic-look-${o}`}
              accessibilityRole="button"
              aria-pressed={choice === o}
              onPress={() => onPick(o)}
              style={[styles.option, choice === o && styles.optionOn]}>
              <Figurine look={o === 'mix' ? 'dove' : o} pose="sit" width={54} height={90} />
              <Text style={styles.optionText}>{t(`ceramic.looks.${o}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
          <Text style={styles.doneText}>{t('ceramic.done')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

export function CeramicLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  useFonts({ DancingScript_600SemiBold });
  const tokens = useMemo(() => ceramicTokens(theme), [theme]);
  const reduced = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [look, setLook] = useState<LookChoice>('mix');
  const [picking, setPicking] = useState(false);
  const [center, setCenter] = useState<number | null>(null);
  const [flight, setFlight] = useState<{ from: 'top' | 'bottom'; side: 'left' | 'right'; key: number } | null>(null);
  const flights = useRef(0);
  useEffect(() => {
    AsyncStorage.getItem(LOOK_KEY)
      .then((v) => v && (v === 'mix' || (LOOKS as readonly string[]).includes(v)) && setLook(v as LookChoice))
      .catch(() => undefined);
  }, []);
  const pick = useCallback((c: LookChoice) => {
    setLook(c);
    AsyncStorage.setItem(LOOK_KEY, c).catch(() => undefined);
  }, []);
  // The post nearest the middle of the screen is the one its angel presents.
  const centerRef = useRef<number | null>(null);
  const viewability = useRef({ itemVisiblePercentThreshold: 40 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null; isViewable: boolean }[] }) => {
    const seen = viewableItems.filter((v) => v.isViewable && v.index != null).map((v) => v.index!);
    if (!seen.length) return;
    const mid = seen[Math.floor((seen.length - 1) / 2)]!;
    const prev = centerRef.current;
    if (prev === mid) return;
    centerRef.current = mid;
    setCenter(mid);
    // Now and then an angel flies in from the post that just left the screen.
    if (prev != null && flights.current++ % 2 === 0) setFlight({ from: mid > prev ? 'top' : 'bottom', side: angelSide(mid), key: Date.now() });
  }).current;
  const lane = Math.min(box.w, 560);
  return (
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="ceramic-layout" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* The turtle walks behind the cards; it shows only in the gaps. */}
      {box.w ? <Turtle width={box.w} reduced={reduced} /> : null}
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        style={styles.list}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) =>
          lane ? (
            <View style={{ width: lane, alignSelf: 'center' }}>
              <PostRow card={item} index={index} width={lane} tokens={tokens} look={look} present={!reduced && index === center} pinned={item.id === pinnedId} renderCard={renderCard} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {header}
            <Pressable accessibilityRole="button" testID="ceramic-pick" onPress={() => setPicking(true)} style={styles.pickButton}>
              <Text style={styles.pickText}>{t('ceramic.pick', { name: t(`ceramic.looks.${look}`) })}</Text>
            </Pressable>
          </View>
        }
        ListFooterComponent={atEnd && cards.length > 0 ? <Text style={styles.end}>{t('ceramic.end')}</Text> : <View style={{ height: 60 }} />}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewability}
        {...feedListTuning}
        // Only up and down: the feed never slides sideways (Steve).
        horizontal={false}
        alwaysBounceHorizontal={false}
        showsHorizontalScrollIndicator={false}
      />
      {flight && !reduced && box.h ? <Flyer key={flight.key} from={flight.from} side={flight.side} width={box.w} height={box.h} onDone={() => setFlight(null)} /> : null}
      <Picker visible={picking} choice={look} onPick={pick} onClose={() => setPicking(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  list: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingBottom: 40, overflow: 'hidden' },
  header: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  pickButton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 22, backgroundColor: '#EDE3E6', borderWidth: 1, borderColor: 'rgba(110,85,100,0.25)' },
  pickText: { fontSize: 15, color: '#4B3F47' },
  row: { position: 'relative', paddingTop: TOP, marginBottom: 30, overflow: 'visible' },
  sky: { position: 'absolute', left: 0, top: 0 },
  cloudBehind: { position: 'absolute', top: '55%' },
  spokes: { position: 'absolute', top: 17, width: 18, height: 18 },
  figure: { position: 'absolute', top: 22, width: FIG_W, height: FIG_H, zIndex: 2 },
  hung: { position: 'relative', paddingTop: 6 },
  sideRope: { position: 'absolute', top: 0, bottom: 22, width: 4, borderRadius: 2, backgroundColor: ROPE, borderLeftWidth: 1.5, borderLeftColor: ROPE_LIGHT },
  pinned: { marginHorizontal: BOX_IN, marginBottom: 6, fontWeight: '700', fontSize: 14, color: '#4B3F47' },
  frame: {
    marginHorizontal: BOX_IN,
    borderRadius: 14,
    padding: 6,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.85)',
    borderLeftColor: 'rgba(255,255,255,0.85)',
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderBottomColor: 'rgba(120,90,105,0.2)',
    borderRightColor: 'rgba(120,90,105,0.2)',
    shadowColor: '#5A4150',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    zIndex: 1,
  },
  // The deep inside of the shadow box: darker at its top edge where the frame casts its shadow.
  recess: { borderRadius: 9, padding: 7, borderTopWidth: 4, borderTopColor: 'rgba(75,55,65,0.22)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.65)' },
  // The plaque itself: matte, with an etched border, casting a soft shadow in the box.
  plaque: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(95,70,85,0.32)',
    shadowColor: '#46323C',
    shadowOpacity: 0.24,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  platform: { marginHorizontal: PLATFORM_IN, marginTop: -4, zIndex: 1 },
  platformTop: { height: 10, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: '#F8F1EC', borderBottomWidth: 1, borderBottomColor: 'rgba(95,70,85,0.25)' },
  platformFront: { height: 16, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, shadowColor: '#503C46', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  knob: { position: 'absolute', top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E6CFA0' },
  etch: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(95,70,85,0.28)' },
  tie: { position: 'absolute', top: 0, width: 3, borderRadius: 2, backgroundColor: ROPE, borderLeftWidth: 1, borderLeftColor: ROPE_LIGHT },
  placards: { marginHorizontal: BOX_IN + 2, paddingBottom: 4 },
  placard: { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, shadowColor: '#46323C', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  placardClosed: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  behind: { position: 'absolute', borderRadius: 10, shadowColor: '#46323C', shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } },
  behindMid: { left: 6, right: 6, top: 18, bottom: 6, backgroundColor: '#EDE3E0' },
  behindBack: { left: 12, right: 12, top: 24, bottom: 0, backgroundColor: '#E3D7D4' },
  placardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallOval: { width: 26, height: 30, borderRadius: 15, backgroundColor: '#E9C9C1', alignItems: 'center', justifyContent: 'center' },
  smallOvalText: { fontSize: 13, fontWeight: '600', color: '#4B3F47' },
  placardName: { fontSize: 19, color: '#4B3F47', fontFamily: NAME_FONT },
  placardNameInline: { color: '#4B3F47', fontFamily: NAME_FONT },
  placardText: { fontSize: 16, lineHeight: 23, color: '#4B3F47', marginTop: 4 },
  oneLine: { flex: 1, minWidth: 0, fontSize: 15, color: '#4B3F47' },
  more: { fontSize: 13, color: MUTED },
  replyStack: { marginLeft: 22 },
  replyBehind: { position: 'absolute', left: 7, right: 7, top: 18, bottom: -6, borderRadius: 9 },
  replyCard: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, shadowColor: '#46323C', shadowOpacity: 0.2, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  replyOpen: { flexDirection: 'column', alignItems: 'stretch' },
  replyName: { fontSize: 18, color: '#4B3F47', fontFamily: NAME_FONT },
  replyText: { fontSize: 15, lineHeight: 21, color: '#4B3F47' },
  subReply: { marginTop: 6, marginLeft: 10, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#B9A9CC' },
  subName: { fontSize: 16, color: '#4B3F47', fontFamily: NAME_FONT },
  subText: { fontSize: 14, lineHeight: 19, color: '#4B3F47' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pill: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, backgroundColor: '#F1E4DF', borderWidth: 1, borderColor: 'rgba(95,70,85,0.3)' },
  pillOn: { backgroundColor: '#E3D2D6' },
  pillText: { fontSize: 15, color: '#4B3F47' },
  pebble: { alignSelf: 'center', marginTop: 10, minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 22, backgroundColor: '#F1E4DF', borderWidth: 1, borderColor: 'rgba(95,70,85,0.3)' },
  pebbleText: { fontSize: 15, color: '#4B3F47' },
  end: { marginHorizontal: BOX_IN, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#F7F1EE', color: '#4B3F47', fontSize: 16, textAlign: 'center', overflow: 'hidden' },
  turtle: { position: 'absolute', left: 0, bottom: 8, width: 64, height: 36 },
  flyer: { position: 'absolute', left: 0, top: 0, width: 40, height: 67, zIndex: 6 },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(75,60,70,0.32)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#F6F0EE', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30, gap: 8 },
  sheetTitle: { fontSize: 25, fontWeight: '600', color: '#4B3F47', textAlign: 'center' },
  sheetSub: { fontSize: 14, color: MUTED, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  option: { width: '30%', minWidth: 96, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 16, backgroundColor: '#EFE5E3', borderWidth: 2, borderColor: 'transparent' },
  optionOn: { borderColor: '#8E7088' },
  optionText: { fontSize: 13.5, color: '#4B3F47', textAlign: 'center' },
  done: { marginTop: 8, minHeight: 48, borderRadius: 24, backgroundColor: '#7A5C74', alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#FFFFFF', fontSize: 17 },
});
