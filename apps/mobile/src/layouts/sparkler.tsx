// Full Screen Sparkler (beta, behind Admin → Feed skins), Steve 2026-11-01:
//   * A simple full-screen scroll with no border: each post fills the width of the screen.
//   * ONE vertical line on the left overlaps the posts. It goes downward and grows as you scroll,
//     with a sparkler at its bottom leading the way down, throwing its sparks and embers downward
//     so the direction shows; its tip rides near the foot of the screen so the line never seems to
//     stop while there is more below (lib/draw-in.ts lineTip; the line is the shared glass tube,
//     components/glass-tube.tsx).
//   * Comments are indented, replies further. Closed, only the first line of the first comment
//     shows, the rest folded under it like accordion-folded paper; a tap unfolds the next 5; a tap
//     on an open comment folds them closed.
//   * Each post is separated by a black line with a light blue line through its middle.
//   * The post backgrounds are chosen like Facebook post backgrounds: solid color blocks,
//     starfields, flowers and textures, under Menu → Settings → Themes → Full Screen Sparkler
//     Theme → Background choices (lib/sparkler-backgrounds.ts). All drawn, no pictures.
//   * The poster's profile picture sits in the upper right corner of the post's square.
// Buttons, comments and paging come from the shared skin hooks (docs/SKIN_HOOKS.md).
import type { Card, Comment, FeedTheme } from '@prayer-tower/shared';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Image, Pressable, StyleSheet, Text, useColorScheme, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { CardInk } from '@/components/post-card';
import { GlassTube, GLOW_REACH } from '@/components/glass-tube';
import { lineTip } from '@/lib/draw-in';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { flowerPoints, petalPath, seeded, shownBackground, sparklerBackground, starPoints, useSparklerBackground, type SparklerBackground } from '@/lib/sparkler-backgrounds';
import { colors, radius, space, type } from '@/lib/theme';
import { useCommentActions, usePostComments } from '@/skins/comments';
import { useFeedHooks } from '@/skins/feed-hooks';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';

const DEFAULTS = { backdrop: '#000000', stripe: '#8FD3FF' };
type SparklerTokens = typeof DEFAULTS;

export function sparklerTokens(theme: FeedTheme | null): SparklerTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof t[k] === typeof v) out[k] = t[k];
  return out as SparklerTokens;
}

/** Where the line runs down the left, over the posts, and how far in the posts' words start. */
export const LINE_X = 12;
const TEXT_LEFT = 34;
/** How far down the screen the line's tip (and its sparkler) rides: near the foot, so the line never seems to stop short. */
export const TIP_AT = 0.84;
/** Black room at the top of the feed under the Home and Menu buttons, so they never cover a post. */
const TOP_ROOM = 58;
/** How far comments, and then their replies, sit in from the post's words. */
const COMMENT_INDENT = 18;
const REPLY_INDENT = 18;
/** The separator: a black line with a glowing light blue line through its middle, made bold (Steve: accentuate the divider). */
/** The bar between posts: three picas of very dark brushed metal, not a glowing line (Steve, 2026-11-02); its metal top to bottom (Kit Sparkler.separatorMetal). */
export const SEPARATOR = { height: 36, metal: ['#3A3E45', '#22252A', '#16181C', '#0E1013', '#050607'] };
/** The profile picture in the square's upper right corner. */
const PIC = 48;
/** Comments shown when a post's comments open. */
const OPENED = 5;

/** The card's words on a background: light on the dark ones, the skin's words 1 pt bigger (Steve). */
export function inkFor(bg: SparklerBackground) {
  return bg.dark ? { text: '#FFFFFF', muted: '#D3DAE8', plate: 'rgba(255,255,255,0.88)', bump: 1 } : { text: colors.text, muted: '#544B5C', bump: 1 };
}

// ---------------------------------------------------------------------------
// The backgrounds, drawn to the square's real size.

const FLOWER_COLORS: Record<string, string[]> = { meadow: ['#F2A7B5', '#F6D365', '#B9A4E8'], blossoms: ['#F49AB4', '#F7BFD0', '#EE7FA0'] };

export const BackgroundArt = memo(function BackgroundArt({ bg, w, h, seed }: { bg: SparklerBackground; w: number; h: number; seed: number }) {
  if (!w || !h || bg.group === 'solid') return null;
  let art: React.ReactNode = null;
  if (bg.group === 'stars') {
    const many = bg.id === 'deep-space' ? 2 : 1;
    const stars = [...starPoints(w, h, seed), ...(many > 1 ? starPoints(w, h, seed + 7) : [])];
    art = stars.map((s, i) => <Circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.blue ? '#BFE3FF' : '#FFFFFF'} opacity={s.o} />);
  } else if (bg.group === 'flowers') {
    const hues = FLOWER_COLORS[bg.id] ?? FLOWER_COLORS.meadow!;
    art = flowerPoints(w, h, seed).map((f, i) => (
      <G key={i} opacity={0.55}>
        <Path d={petalPath(f.x, f.y, f.r, f.turn)} fill={hues[f.hue % hues.length]} />
        <Circle cx={f.x} cy={f.y} r={f.r * 0.28} fill="#F3C94E" />
      </G>
    ));
  } else if (bg.id === 'linen') {
    const lines: React.ReactNode[] = [];
    for (let y = 2; y < h; y += 4) lines.push(<Line key={`h${y}`} x1={0} y1={y} x2={w} y2={y} stroke="#D9CFBE" strokeWidth={0.6} opacity={0.6} />);
    for (let x = 2; x < w; x += 4) lines.push(<Line key={`v${x}`} x1={x} y1={0} x2={x} y2={h} stroke="#D9CFBE" strokeWidth={0.6} opacity={0.4} />);
    art = lines;
  } else if (bg.id === 'paper') {
    const rnd = seeded(seed);
    art = Array.from({ length: Math.round((w * h) / 500) }, (_, i) => <Circle key={i} cx={rnd() * w} cy={rnd() * h} r={0.3 + rnd() * 0.6} fill="#BFB49C" opacity={0.25 + rnd() * 0.3} />);
  } else if (bg.id === 'wood') {
    const rnd = seeded(seed);
    const grain: React.ReactNode[] = [];
    for (let y = 4, i = 0; y < h; y += 7 + rnd() * 9, i++) {
      const a = 2 + rnd() * 4;
      const p = 60 + rnd() * 80;
      let d = `M 0 ${y.toFixed(1)}`;
      for (let x = 10; x <= w + 10; x += 10) d += ` L ${x} ${(y + Math.sin((x / p) * Math.PI * 2 + i) * a).toFixed(1)}`;
      grain.push(<Path key={i} d={d} stroke="#B48F5E" strokeWidth={0.9 + rnd()} fill="none" opacity={0.35} />);
    }
    art = grain;
  }
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      {art}
    </Svg>
  );
});

/** A swatch of a background, for the Background choices screen. */
export function BackgroundSwatch({ id, size = 64 }: { id: string; size?: number }) {
  const bg = sparklerBackground(id);
  return (
    <View style={{ width: size, height: size, backgroundColor: bg.base, borderRadius: radius.md, overflow: 'hidden' }}>
      <BackgroundArt bg={bg} w={size} h={size} seed={3} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// The sparkler at the line's tip.

const SPARK_COLORS = ['#FFFFFF', '#FFF2B0', '#FFD45C', '#FFB23D', '#FF8A2A'];
const SPARK_BOX = 84;
/** How far below the tip the falling embers reach. */
const TRAIL = 110;

/** Sparks thrown out from the burning tip, most of them downward, the way the line is going. */
export function sparks(rnd: () => number, n = 16) {
  const c = SPARK_BOX / 2;
  return Array.from({ length: n }, (_, i) => {
    const a = i % 4 === 0 ? rnd() * Math.PI * 2 : Math.PI * (0.15 + rnd() * 0.7);
    const r0 = 3 + rnd() * 3;
    const r1 = (r0 + 6 + rnd() * 18) * 1.3;
    return { x1: c + Math.cos(a) * r0, y1: c + Math.sin(a) * r0, x2: c + Math.cos(a) * r1, y2: c + Math.sin(a) * r1, color: SPARK_COLORS[Math.floor(rnd() * SPARK_COLORS.length)]!, dot: rnd() < 0.4 };
  });
}

const STILL_SPRAY = sparks(seeded(5));

/** The burning tip with embers streaming down below it: the leading animation (Steve). Still under Reduce Motion. */
function Sparkler({ still }: { still: boolean }) {
  // Each tick redraws a fresh spray and moves the embers down.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setTick((n) => n + 1), 50);
    return () => clearInterval(id);
  }, [still]);
  const spray = still ? STILL_SPRAY : sparks(Math.random);
  const phase = still ? 0.35 : (tick % 24) / 24;
  const c = SPARK_BOX / 2;
  return (
    <Svg width={SPARK_BOX} height={SPARK_BOX + TRAIL} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((i) => {
        const f = (phase + i / 3) % 1;
        const y = c + 14 + f * (TRAIL + c - 20);
        return (
          <G key={`e${i}`}>
            <Line x1={c} y1={y - 12 * (1 - f)} x2={c} y2={y} stroke="#FFFFFF" strokeOpacity={0.7 * (1 - f)} strokeWidth={1.5} strokeLinecap="round" />
            <Circle cx={c} cy={y} r={4 - f * 2.5} fill="#FFD45C" opacity={0.9 * (1 - f)} />
          </G>
        );
      })}
      <Circle cx={c} cy={c} r={16} fill="#FFD45C" opacity={0.22} />
      <Circle cx={c} cy={c} r={8} fill="#FFE680" opacity={0.75} />
      {spray.map((s, i) => (
        <G key={i}>
          <Line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={1.6} strokeLinecap="round" />
          {s.dot ? <Circle cx={s.x2} cy={s.y2} r={1.6} fill={s.color} /> : null}
        </G>
      ))}
      <Circle cx={c} cy={c} r={4} fill="#FFFFFF" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** The poster's own profile picture (initials until they add one), in the square's upper right corner. */
function ProfilePic({ card }: { card: Card }) {
  return (
    <View style={styles.pic} testID={`sparkler-pic-${card.id}`} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {card.author.photoUrl ? <Image source={{ uri: card.author.photoUrl }} style={styles.picPhoto} accessibilityIgnoresInvertColors /> : <Text style={styles.picText}>{initials(card.author.displayName)}</Text>}
    </View>
  );
}

/** The bar between posts: three picas of very dark metal. */
export function Separator() {
  return (
    <View style={styles.separator} testID="sparkler-separator" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={SEPARATOR.height} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="sparkler-sep" x1="0" y1="0" x2="0" y2="1">
            {[0, 0.1, 0.45, 0.85, 1].map((at, i) => (
              <Stop key={at} offset={at} stopColor={SEPARATOR.metal[i]} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={SEPARATOR.height} fill="url(#sparkler-sep)" />
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Comments, in the post's square under it.

type Ink = ReturnType<typeof inkFor>;

function CommentButtons({ postId, comment, canReply, ink, stripe }: { postId: string; comment: Comment; canReply: boolean; ink: Ink; stripe: string }) {
  const { reply, helped, share } = useCommentActions(postId, comment);
  const button = (key: string, b: { name: string; press: () => void; on?: boolean }) => (
    <Pressable key={key} onPress={b.press} accessibilityRole="button" aria-pressed={key === 'helped' ? !!b.on : undefined} style={[styles.pill, { borderColor: stripe }, b.on && { backgroundColor: stripe }]} hitSlop={4}>
      <Text style={[styles.pillText, { color: b.on ? '#0B1330' : ink.text }]}>{b.name}</Text>
    </Pressable>
  );
  return (
    <View style={styles.pills}>
      {/* Steve: sub-comments get no Reply button (overnesting is hard to follow). */}
      {canReply ? button('reply', reply) : null}
      {helped ? button('helped', helped) : null}
      {share ? button('share', share) : null}
    </View>
  );
}

/** A comment unfolding like a panel of accordion-folded paper: turning out from flat, hinged top and bottom by turns, each a beat after the last. */
function Unfold({ index, still, children }: { index: number; still: boolean; children: React.ReactNode }) {
  const [turn] = useState(() => new Animated.Value(still ? 1 : 0));
  useEffect(() => {
    if (still) return;
    Animated.spring(turn, { toValue: 1, delay: (index % OPENED) * 70, useNativeDriver: false, bounciness: 4 }).start();
  }, [turn, index, still]);
  const from = index % 2 === 0 ? '-90deg' : '90deg';
  return (
    <Animated.View
      style={{
        opacity: turn.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 1] }),
        transform: [{ perspective: 600 }, { rotateX: turn.interpolate({ inputRange: [0, 1], outputRange: [from, '0deg'] }) }],
        transformOrigin: index % 2 === 0 ? 'top' : 'bottom',
      }}>
      {children}
    </Animated.View>
  );
}

function OneComment({ postId, comment, replies, showAll, onFold, onReplies, ink, stripe }: { postId: string; comment: Comment; replies: Comment[]; showAll: boolean; onFold: () => void; onReplies: () => void; ink: Ink; stripe: string }) {
  const { t } = useLocale();
  // Steve: the first reply shows under every comment that has replies; a tap shows the rest, and another folds them away.
  const shown = showAll ? replies : replies.slice(0, 1);
  return (
    <View style={[styles.comment, { borderLeftColor: stripe }]} testID={`sparkler-comment-${comment.id}`}>
      <Pressable onPress={onFold} accessibilityRole="button" aria-expanded accessibilityHint={t('sparkler.fold')}>
        <Text style={[styles.commentName, { color: ink.text }]}>{comment.author.displayName}</Text>
        <Text style={[styles.commentText, { color: ink.text }]}>{comment.body}</Text>
      </Pressable>
      <CommentButtons postId={postId} comment={comment} canReply ink={ink} stripe={stripe} />
      {shown.length ? (
        <Pressable
          onPress={replies.length > 1 ? onReplies : undefined}
          disabled={replies.length < 2}
          accessibilityRole={replies.length > 1 ? 'button' : undefined}
          aria-expanded={replies.length > 1 ? showAll : undefined}
          style={[styles.replies, { borderLeftColor: stripe }]}
          testID={`sparkler-replies-${comment.id}`}>
          {shown.map((r) => (
            <View key={r.id} style={styles.reply} testID={`sparkler-reply-${r.id}`}>
              <Text style={[styles.replyText, { color: ink.text }]}>
                <Text style={styles.replyName}>{r.author.displayName}: </Text>
                {r.body}
              </Text>
              {showAll ? <CommentButtons postId={postId} comment={r} canReply={false} ink={ink} stripe={stripe} /> : null}
            </View>
          ))}
          {!showAll && replies.length > 1 ? <Text style={[styles.moreReplies, { color: ink.muted }]}>{t('sparkler.moreReplies', { count: replies.length - 1 })}</Text> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

function Comments({ card, ink, stripe, still }: { card: Card; ink: Ink; stripe: string; still: boolean }) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const { top, kids, total } = usePostComments(card);
  // How many comments are unfolded (0 is closed), and whose replies all show.
  const [openTo, setOpenTo] = useState(0);
  const [allReplies, setAllReplies] = useState<string | null>(null);
  const first = top[0];
  if (!first) return null;
  const count = Math.max(total, top.length);
  const fold = () => {
    setOpenTo(0);
    setAllReplies(null);
  };
  if (openTo === 0) {
    const more = count - 1;
    return (
      <Pressable
        onPress={() => setOpenTo(Math.min(1 + OPENED, top.length))}
        accessibilityRole="button"
        aria-expanded={false}
        accessibilityHint={t('sparkler.open')}
        style={[styles.comments, styles.closed, { backgroundColor: `${ink.text}12`, borderLeftColor: stripe }]}
        testID={`sparkler-comments-${card.id}`}>
        {/* Plainly comments: a speech bubble and how many (Steve: the folded look alone didn't say so). */}
        <Text style={[styles.count, { color: ink.text }]} testID={`sparkler-count-${card.id}`}>
          💬 {t('sparkler.comments', { count })} ▾
        </Text>
        <Text style={[styles.commentText, { color: ink.text }]} numberOfLines={1} testID={`sparkler-first-line-${card.id}`}>
          <Text style={styles.replyName}>{first.author.displayName}: </Text>
          {first.body}
        </Text>
        {more > 0 ? (
          <>
            <View style={styles.folds} testID={`sparkler-folds-${card.id}`}>
              {Array.from({ length: Math.min(3, more) }, (_, i) => (
                // The rest of the comments under it: full-width white 1 pt lines (Steve, 2026-11-02).
                <View key={i} style={styles.foldLine} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
              ))}
            </View>
          </>
        ) : null}
      </Pressable>
    );
  }
  const shown = top.slice(0, openTo);
  const left = count - shown.length;
  return (
    <View style={styles.comments} testID={`sparkler-comments-${card.id}`}>
      {shown.map((c, i) => (
        <Unfold key={c.id} index={i} still={still}>
          <OneComment
            postId={card.id}
            comment={c}
            replies={kids.get(c.id) ?? []}
            showAll={allReplies === c.id}
            onFold={fold}
            onReplies={() => setAllReplies(allReplies === c.id ? null : c.id)}
            ink={ink}
            stripe={stripe}
          />
        </Unfold>
      ))}
      {left > 0 ? (
        <Pressable onPress={openTo < top.length ? () => setOpenTo(Math.min(openTo + OPENED, top.length)) : () => openPost(card.id)} accessibilityRole="button" style={styles.moreRow}>
          <Text style={[styles.more, { color: ink.text }]}>{t('sparkler.more', { n: left })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

const PostSquare = memo(function PostSquare({ card, index, tokens, bg, pinned, still, renderCard }: { card: Card; index: number; tokens: SparklerTokens; bg: SparklerBackground; pinned: boolean; still: boolean; renderCard: FeedLayoutProps['renderCard'] }) {
  const { t } = useLocale();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ink = useMemo(() => inkFor(bg), [bg]);
  return (
    <View
      testID={`sparkler-${card.id}`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
      }}>
      <View style={[styles.square, { backgroundColor: bg.base }]}>
        <BackgroundArt bg={bg} w={size.w} h={size.h} seed={index * 31 + 7} />
        <ProfilePic card={card} />
        {pinned ? <Text style={[styles.pinned, { color: ink.text }]}>{t('feed.pinned')}</Text> : null}
        <CardInk.Provider value={ink}>{renderCard(card.counts.comments > 0 ? { ...card, topComment: null } : card)}</CardInk.Provider>
        <Comments card={card} ink={ink} stripe={tokens.stripe} still={still} />
      </View>
      <Separator />
    </View>
  );
});

/** How far ahead of its resting place a swipe throws the sparkler: as far as the feed is moving fast (`delta` is this scroll step), at most a tenth of the screen down, a twentieth up, eased in; as the swipe slows the screen catches up (Kit Sparkler.lead). */
export function swipeLead(lead: number, delta: number, screen: number) {
  const goal = Math.min(screen * 0.1, Math.max(-screen * 0.05, delta * 2.2));
  return lead + (goal - lead) * 0.35;
}

/** The trail's yellows (Steve, 2026-11-01): bright on the dark, deeper gold on light posts so it shows. */
export const TRAIL_YELLOWS = ['#FFE14D', '#FFD21F', '#FFC400', '#FFF08A'];
export const TRAIL_YELLOWS_LIGHT = ['#F2B800', '#E6A700', '#D99A00', '#F5C518'];

type Mote = { y: number; dx: number; r: number; opacity: number; warm: boolean; glint: boolean; color: number };
type Grain = { y: number; x: number; vy: number; vx: number; born: number; life: number; r: number; phase: number; warm: boolean; glint: boolean; color: number };

/**
 * The trail of sparkle and stardust (Kit Sparkler.DustTrail; Steve, 2026-11-02): where the sparkler
 * has been, held on the SCREEN, never carried by the scroll. As it travels through the feed it lays
 * its trail along the stretch of line it just passed. Each mote keeps a little of the way it was going
 * (down while the feed scrolls on, up when it turns back) and slows as that inertia decays, so when
 * the scroll reverses the new trail overlaps the old one, drifting the other way. None of it is
 * permanent: every mote fades out in a few seconds, and away near the top.
 */
export class DustTrail {
  static readonly most = 700;
  static readonly inertia = 1.8;
  private grains: Grain[] = [];
  private last: { content: number; t: number } | null = null;
  private rnd: () => number;
  constructor(seed = 7) {
    this.rnd = seeded(seed);
  }
  get count() {
    return this.grains.length;
  }
  /** Follows the sparkler: `tip` on screen, `content` in the feed, at `time` (seconds); lays about one mote per 3 points it travels, along the stretch it just passed. */
  follow(tip: number, content: number, time: number) {
    this.grains = this.grains.filter((g) => time - g.born <= g.life);
    const l = this.last;
    if (!l || time <= l.t) {
      this.last = { content, t: time };
      return;
    }
    const d = content - l.content;
    const dt = time - l.t;
    this.last = { content, t: time };
    // A jump (a new page, the feed reloading) leaves no trail.
    if (Math.abs(d) <= 0.3 || Math.abs(d) >= 400) return;
    const speed = d / dt;
    const way = d > 0 ? 1 : -1;
    const n = Math.min(18, Math.floor(Math.abs(d) / 3) + 1);
    const rnd = this.rnd;
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const side = rnd() < 0.5 ? -1 : 1;
      const glint = rnd() < 0.3;
      this.grains.push({
        // The stretch it just passed: behind it on screen, the way it came.
        y: tip - d * (1 - f) + (rnd() - 0.5) * 3,
        x: side * (1 + rnd() * (glint ? 6 : 3)),
        vy: way * Math.min(45, Math.abs(speed) * (0.015 + rnd() * 0.03)) + way * 3,
        vx: side * (2 + rnd() * 7),
        born: l.t + dt * f,
        life: glint ? 2 + rnd() * 2 : 4 + rnd() * 3.5,
        r: glint ? 1.5 + rnd() * 2.5 : 0.7 + rnd() * 1.3,
        phase: rnd() * 6.28,
        warm: rnd() < 0.6,
        glint,
        color: Math.floor(rnd() * 4) % 4,
      });
    }
    if (this.grains.length > DustTrail.most) this.grains.splice(0, this.grains.length - DustTrail.most);
  }
  /** Where each mote is on screen now: carried on the way it was laid, slowing; fading in, out at the end of its life, and away near the top. */
  motes(time: number): Mote[] {
    const out: Mote[] = [];
    for (const g of this.grains) {
      const age = time - g.born;
      if (age < 0 || age >= g.life) continue;
      const carried = DustTrail.inertia * (1 - Math.exp(-age / DustTrail.inertia));
      const y = g.y + g.vy * carried + Math.sin(time * 0.45 + g.phase) * 1.0;
      const dx = g.x + g.vx * carried + Math.cos(time * 0.4 + g.phase) * 1.0;
      const life = age / g.life;
      const fade = Math.min(1, age / 0.15) * (life < 0.5 ? 1 : Math.max(0, 1 - (life - 0.5) / 0.5));
      const top = Math.max(0, Math.min(1, (y - 20) / 110));
      const twinkle = g.glint ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * (4 + g.phase) + g.phase)) : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * (2 + g.phase / 2) + g.phase));
      const o = fade * top * twinkle;
      if (o > 0.04) out.push({ y, dx, r: g.r, opacity: Math.min(1, o * 1.3), warm: g.warm, glint: g.glint, color: g.color });
    }
    return out;
  }
}

/** The trail of sparkle and stardust the sparkler leaves (still under Reduce Motion). */
function SparkleTrail({ tip, scrolled, still }: { tip: number; scrolled: number; still: boolean }) {
  const [trail] = useState(() => new DustTrail());
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setTime(Date.now() / 1000), 50);
    return () => clearInterval(id);
  }, [still]);
  const dark = useColorScheme() === 'dark';
  // Where the sparkler has been, held on the screen (never carried by the scroll), each mote drifting
  // on the way it was laid and slowing, none of it permanent (Steve, 2026-11-02).
  if (!still) trail.follow(tip, scrolled + tip, time);
  const motes = trail.motes(time);
  const dust = motes.filter((m) => !m.glint);
  const glints = motes.filter((m) => m.glint);
  const yellows = dark ? TRAIL_YELLOWS : TRAIL_YELLOWS_LIGHT;
  if (!motes.length) return null;
  return (
    <Svg aria-hidden width={LINE_X + 54} height={Math.max(1, tip + 180)} style={{ position: 'absolute', left: 0, top: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="sparkler-trail">
      {dust.map((m, i) => (
        <Circle key={`d${i}`} cx={LINE_X + m.dx} cy={m.y} r={m.r} fill={dark ? (m.warm ? '#FFF3B0' : '#FFFFFF') : m.warm ? '#E6A700' : '#F5C518'} opacity={m.opacity} />
      ))}
      {glints.map((g, i) => (
        <G key={i} opacity={g.opacity}>
          <Line x1={LINE_X + g.dx - g.r} y1={g.y} x2={LINE_X + g.dx + g.r} y2={g.y} stroke={yellows[g.color]} strokeWidth={1.4} strokeLinecap="round" />
          <Line x1={LINE_X + g.dx} y1={g.y - g.r} x2={LINE_X + g.dx} y2={g.y + g.r} stroke={yellows[g.color]} strokeWidth={1.4} strokeLinecap="round" />
        </G>
      ))}
    </Svg>
  );
}

/** The one line down the feed, over the posts, as far as it has grown on screen, and the sparkler at its tip. */
function TheLine({ top, rest, end, lead, scrolled, stripe, still }: { top: number; rest: number; end: number; lead: Animated.Value; scrolled: number; stripe: string; still: boolean }) {
  const room = GLOW_REACH + 4;
  const tip = Math.min(rest, end);
  const atEnd = rest >= end - 1;
  // The swipe throws the tip on ahead of where it rests; it springs back as the screen catches up.
  const ahead = atEnd ? 0 : lead;
  // One piece, from the header's light blue edge (up through the black band above the feed) to the
  // tip, so it never breaks or thins anywhere, pulled down or not (Steve, 2026-11-02).
  const from = top - TOP_ROOM;
  const tall = Math.max(0, tip - from) + 120;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="sparkler-line">
      <Animated.View style={{ position: 'absolute', left: 0, top: from, width: LINE_X + room, overflow: 'hidden', height: Animated.add(Math.max(0, tip - from), ahead) }}>
        <Svg aria-hidden width={LINE_X + room} height={tall} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GlassTube d={`M ${LINE_X} 0 L ${LINE_X} ${tall}`} color={stripe} width={5} />
        </Svg>
      </Animated.View>
      <SparkleTrail tip={tip} scrolled={scrolled} still={still} />
      {!atEnd ? (
        <Animated.View style={[styles.tip, { top: tip - SPARK_BOX / 2, transform: [{ translateY: ahead }] }]} testID="sparkler-tip">
          <Sparkler still={still} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export function SparklerLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => sparklerTokens(theme), [theme]);
  const dark = useColorScheme() === 'dark';
  const bg = shownBackground(useSparklerBackground(), dark);
  const still = useReducedMotion();
  // How far the feed has scrolled, how tall the screen and the feed are, and where the tip is in
  // the feed's own points: always at the same place on screen, so the sparkler is never lost from
  // sight and the line always runs on toward the foot of the screen.
  const [view, setView] = useState({ scrolled: 0, screen: 0, feed: 0, reached: 0 });
  const move = (next: Partial<typeof view>) =>
    setView((v) => {
      const n = { ...v, ...next };
      return { ...n, reached: lineTip(n.scrolled, n.screen, 0, Infinity, TIP_AT) };
    });
  // How far a swipe has thrown the sparkler ahead (Steve: the swipe moves the sparkler down, then
  // the screen catches up to where it went, with a bounce).
  const [lead] = useState(() => new Animated.Value(0));
  const ahead = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const delta = contentOffset.y - view.scrolled;
    move({ scrolled: contentOffset.y, screen: layoutMeasurement.height, feed: contentSize.height });
    if (still || Math.abs(delta) < 0.5) return;
    ahead.current = swipeLead(ahead.current, delta, layoutMeasurement.height);
    lead.stopAnimation();
    lead.setValue(ahead.current);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      ahead.current = 0;
      Animated.spring(lead, { toValue: 0, bounciness: 12, speed: 10, useNativeDriver: false }).start();
    }, 90);
  };
  useEffect(() => () => void (settle.current && clearTimeout(settle.current)), []);
  // Room under the last post, so the line can grow all the way down past it.
  const tail = Math.round((view.screen || 800) * (1 - TIP_AT)) + 40;
  return (
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="sparkler-layout">
      {/* Black room under the Home and Menu buttons, held still above the feed, so they never sit on a post's words. */}
      {/* (The line runs up through it to the header's light blue edge, drawn in one piece with the rest of the line.) */}
      <View style={{ height: TOP_ROOM }} />
      <View style={styles.fill} onLayout={(e: LayoutChangeEvent) => move({ screen: e.nativeEvent.layout.height })}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => <PostSquare card={item} index={index} tokens={tokens} bg={bg} pinned={item.id === pinnedId} still={still} renderCard={renderCard} />}
        ListHeaderComponent={header ? <View style={styles.headerPanel}>{header}</View> : undefined}
        ListFooterComponent={<View style={{ minHeight: tail }}>{atEnd && cards.length > 0 ? <Text style={styles.end}>{t('sparkler.end')}</Text> : null}</View>}
        // Up and down only.
        horizontal={false}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        {...feedListTuning}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => move({ feed: h })}
      />
      {/* The line starts at the first post and is drawn on screen from there to the tip. */}
      {view.screen ? <TheLine top={0} rest={view.reached - view.scrolled} end={Infinity} lead={lead} scrolled={view.scrolled} stripe={tokens.stripe} still={still} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headerPanel: { backgroundColor: colors.background, padding: space.sm },
  // No border, no rounded corners: the post fills the screen's width.
  square: { position: 'relative', overflow: 'hidden', paddingLeft: TEXT_LEFT, paddingRight: space.md, paddingTop: space.md, paddingBottom: space.lg },
  pic: { position: 'absolute', top: space.sm, right: space.sm, width: PIC, height: PIC, borderRadius: PIC / 2, overflow: 'hidden', borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#5B3E96', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  picPhoto: { width: PIC, height: PIC },
  picText: { color: '#FFFFFF', fontWeight: '700', fontSize: 17 },
  pinned: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  separator: { height: SEPARATOR.height, justifyContent: 'center' },
  tip: { position: 'absolute', left: LINE_X - SPARK_BOX / 2, width: SPARK_BOX, height: SPARK_BOX + TRAIL },
  comments: { marginTop: space.md, gap: space.md, marginLeft: COMMENT_INDENT },
  // The indent made plain: a tinted panel set in from the post's words, with a strong rule down its left.
  closed: { gap: 6, borderLeftWidth: 4, borderRadius: 6, paddingVertical: 10, paddingLeft: 12, paddingRight: 10 },
  count: { fontSize: 16, fontWeight: '700' },
  comment: { gap: space.xs, borderLeftWidth: 2, paddingLeft: space.sm },
  folds: { gap: 5, marginTop: 6, marginBottom: 2 },
  foldLine: { height: 1, alignSelf: 'stretch', backgroundColor: '#fff' },
  commentName: { fontWeight: '700', fontSize: 15 },
  commentText: { fontSize: type.body.fontSize + 1, lineHeight: type.body.lineHeight + 1 },
  replies: { borderLeftWidth: 3, paddingLeft: space.sm, marginLeft: REPLY_INDENT, gap: space.xs, paddingVertical: 2 },
  reply: { gap: space.xs },
  replyName: { fontWeight: '700' },
  replyText: { fontSize: 15, lineHeight: 21 },
  moreReplies: { fontSize: 14, fontWeight: '700' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  pill: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, justifyContent: 'center' },
  pillText: { fontSize: 15, fontWeight: '700' },
  moreRow: { minHeight: 44, justifyContent: 'center' },
  more: { fontSize: 15, fontWeight: '700' },
  end: { color: '#FFFFFF', fontSize: 16, textAlign: 'center', padding: space.lg },
});
