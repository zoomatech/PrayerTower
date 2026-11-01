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
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { CardInk } from '@/components/post-card';
import { GlassTube, GLOW_REACH } from '@/components/glass-tube';
import { lineTip } from '@/lib/draw-in';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { flowerPoints, petalPath, seeded, sparklerBackground, starPoints, useSparklerBackground, type SparklerBackground } from '@/lib/sparkler-backgrounds';
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
const TEXT_LEFT = 26;
/** How far down the screen the line's tip (and its sparkler) rides: near the foot, so the line never seems to stop short. */
export const TIP_AT = 0.84;
/** Black room at the top of the feed under the Home and Menu buttons, so they never cover a post. */
const TOP_ROOM = 58;
/** How far comments, and then their replies, sit in from the post's words. */
const COMMENT_INDENT = 18;
const REPLY_INDENT = 18;
/** The separator: a black line with a light blue line through its middle. */
export const SEPARATOR = { height: 8, stripe: 2 };
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

/** A black line with a light blue line through its middle, between posts. */
export function Separator({ tokens }: { tokens: SparklerTokens }) {
  return (
    <View style={[styles.separator, { backgroundColor: tokens.backdrop }]} testID="sparkler-separator" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.stripe, { backgroundColor: tokens.stripe }]} />
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

/** One folded-up comment's edge: a strip of paper creased across its middle. */
function FoldedEdge({ ink, down, inset }: { ink: string; down: boolean; inset: number }) {
  return (
    <View style={[styles.edge, { marginRight: inset, borderColor: ink }]} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.edgeShade, { backgroundColor: ink }, down ? { top: 3 } : { top: 0 }]} />
    </View>
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
        style={styles.comments}
        testID={`sparkler-comments-${card.id}`}>
        <Text style={[styles.commentText, { color: ink.text }]} numberOfLines={1} testID={`sparkler-first-line-${card.id}`}>
          <Text style={styles.replyName}>{first.author.displayName}: </Text>
          {first.body}
        </Text>
        {more > 0 ? (
          <>
            <View style={styles.folds} testID={`sparkler-folds-${card.id}`}>
              {Array.from({ length: Math.min(3, more) }, (_, i) => (
                <FoldedEdge key={i} ink={ink.muted} down={i % 2 === 0} inset={i * 18} />
              ))}
            </View>
            <Text style={[styles.moreReplies, { color: ink.muted }]}>{t('sparkler.more', { n: more })}</Text>
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
      <Separator tokens={tokens} />
    </View>
  );
});

/** The one line down the feed, over the posts, as far as it has grown on screen, and the sparkler at its tip. */
function TheLine({ top, tip, atEnd, stripe, still }: { top: number; tip: number; atEnd: boolean; stripe: string; still: boolean }) {
  const room = GLOW_REACH + 4;
  const h = Math.max(0, tip - top);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="sparkler-line">
      {h > 0 ? (
        <Svg aria-hidden width={LINE_X + room} height={h} style={{ position: 'absolute', left: 0, top }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GlassTube d={`M ${LINE_X} 0 L ${LINE_X} ${h}`} color={stripe} width={5} />
        </Svg>
      ) : null}
      {!atEnd ? (
        <View style={[styles.tip, { top: tip - SPARK_BOX / 2 }]} testID="sparkler-tip">
          <Sparkler still={still} />
        </View>
      ) : null}
    </View>
  );
}

export function SparklerLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => sparklerTokens(theme), [theme]);
  const bg = useSparklerBackground();
  const still = useReducedMotion();
  // How far the feed has scrolled, how tall the screen and the feed are, and where the tip has
  // reached in the feed's own points (it never draws back).
  const [view, setView] = useState({ scrolled: 0, screen: 0, feed: 0, reached: 0 });
  const move = (next: Partial<typeof view>) =>
    setView((v) => {
      const n = { ...v, ...next };
      return { ...n, reached: lineTip(n.scrolled, n.screen, v.reached, n.feed, TIP_AT) };
    });
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    move({ scrolled: contentOffset.y, screen: layoutMeasurement.height, feed: contentSize.height });
  };
  // Room under the last post, so the line can grow all the way down past it.
  const tail = Math.round((view.screen || 800) * (1 - TIP_AT)) + 40;
  return (
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="sparkler-layout" onLayout={(e: LayoutChangeEvent) => move({ screen: e.nativeEvent.layout.height })}>
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => <PostSquare card={item} index={index} tokens={tokens} bg={bg} pinned={item.id === pinnedId} still={still} renderCard={renderCard} />}
        ListHeaderComponent={
          <>
            {/* Black room under the Home and Menu buttons. */}
            <View style={{ height: TOP_ROOM }} />
            {header ? <View style={styles.headerPanel}>{header}</View> : null}
          </>
        }
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
      {view.screen ? <TheLine top={Math.max(0, TOP_ROOM - view.scrolled)} tip={view.reached - view.scrolled} atEnd={view.feed > 0 && view.reached >= view.feed - 1} stripe={tokens.stripe} still={still} /> : null}
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
  stripe: { height: SEPARATOR.stripe },
  tip: { position: 'absolute', left: LINE_X - SPARK_BOX / 2, width: SPARK_BOX, height: SPARK_BOX + TRAIL },
  comments: { marginTop: space.md, gap: space.md, marginLeft: COMMENT_INDENT },
  comment: { gap: space.xs, borderLeftWidth: 2, paddingLeft: space.sm },
  folds: { gap: 2, marginTop: 4 },
  edge: { height: 7, borderRadius: 1.5, borderWidth: StyleSheet.hairlineWidth, opacity: 0.45, overflow: 'hidden' },
  edgeShade: { position: 'absolute', left: 0, right: 0, height: 3.5, opacity: 0.35 },
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
