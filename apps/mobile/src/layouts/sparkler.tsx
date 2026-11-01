// Full Screen Sparkler (beta, behind Admin → Feed skins), Steve 2026-11-01:
//   * A simple full-screen scroll with no border: each post fills the width of the screen.
//   * A vertical line on the left overlaps the posts. It goes downward and grows as you scroll,
//     with a sparkler at its bottom leading the way down (lib/draw-in.ts useGrowWithScroll, the
//     shared growing-line routine; the line is the shared glass tube, components/glass-tube.tsx).
//   * Each post is separated by a black line with a light blue line through its middle.
//   * The post backgrounds are chosen like Facebook post backgrounds: solid color blocks,
//     starfields, flowers and textures, under Menu → Settings → Themes → Full Screen Sparkler
//     Theme → Background choices (lib/sparkler-backgrounds.ts). All drawn, no pictures.
//   * The poster's profile picture sits in the upper right corner of the post's square.
// Buttons, comments and paging come from the shared skin hooks (docs/SKIN_HOOKS.md).
import type { Card, Comment, FeedTheme } from '@prayer-tower/shared';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { CardInk } from '@/components/post-card';
import { GlassTube, GLOW_REACH } from '@/components/glass-tube';
import { DrawBusContext, makeDrawBus, useGrowWithScroll, type Row } from '@/lib/draw-in';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { flowerPoints, petalPath, seeded, sparklerBackground, starPoints, useSparklerBackground, type SparklerBackground } from '@/lib/sparkler-backgrounds';
import { colors, radius, space, type } from '@/lib/theme';
import { clusterSlice, useCommentActions, useCommentCluster, usePostComments } from '@/skins/comments';
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
/** How far down the window the line's tip (and its sparkler) rides. */
export const TIP_AT = 0.7;
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
const SPARK_BOX = 64;

/** Sparks thrown out from the burning tip: a fresh spray each time, or one still spray. */
export function sparks(rnd: () => number, n = 16) {
  const c = SPARK_BOX / 2;
  return Array.from({ length: n }, () => {
    const a = rnd() * Math.PI * 2;
    const r0 = 3 + rnd() * 3;
    const r1 = r0 + 6 + rnd() * 18;
    return { x1: c + Math.cos(a) * r0, y1: c + Math.sin(a) * r0, x2: c + Math.cos(a) * r1, y2: c + Math.sin(a) * r1, color: SPARK_COLORS[Math.floor(rnd() * SPARK_COLORS.length)]!, dot: rnd() < 0.4 };
  });
}

const STILL_SPRAY = sparks(seeded(5));

function Sparkler({ still }: { still: boolean }) {
  // Each tick redraws a fresh spray.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setTick((n) => n + 1), 70);
    return () => clearInterval(id);
  }, [still]);
  const spray = still ? STILL_SPRAY : sparks(Math.random);
  const c = SPARK_BOX / 2;
  return (
    <Svg width={SPARK_BOX} height={SPARK_BOX} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={c} cy={c} r={11} fill="#FFD45C" opacity={0.25} />
      <Circle cx={c} cy={c} r={6} fill="#FFE680" opacity={0.7} />
      {spray.map((s, i) => (
        <G key={i}>
          <Line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={1.3} strokeLinecap="round" />
          {s.dot ? <Circle cx={s.x2} cy={s.y2} r={1.3} fill={s.color} /> : null}
        </G>
      ))}
      <Circle cx={c} cy={c} r={3} fill="#FFFFFF" />
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

function OneComment({ postId, comment, replies, open, showAll, onToggle, onReplies, ink, stripe }: { postId: string; comment: Comment; replies: Comment[]; open: boolean; showAll: boolean; onToggle: () => void; onReplies: () => void; ink: Ink; stripe: string }) {
  const { t } = useLocale();
  // Steve: the first reply shows under every comment that has replies; a tap shows the rest, and another folds them away.
  const shown = showAll ? replies : replies.slice(0, 1);
  return (
    <View style={styles.comment} testID={`sparkler-comment-${comment.id}`}>
      <Pressable onPress={onToggle} accessibilityRole="button" aria-expanded={open} accessibilityHint={open ? t('sparkler.fold') : t('sparkler.open')}>
        <Text style={[styles.commentName, { color: ink.text }]}>{comment.author.displayName}</Text>
        <Text style={[styles.commentText, { color: ink.text }]}>{comment.body}</Text>
      </Pressable>
      {open ? <CommentButtons postId={postId} comment={comment} canReply ink={ink} stripe={stripe} /> : null}
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

function Comments({ card, ink, stripe }: { card: Card; ink: Ink; stripe: string }) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const { top, kids, total } = usePostComments(card);
  const { state, toggle, toggleReplies } = useCommentCluster();
  if (!top.length) return null;
  // Closed: the newest comment with its first reply. A tap opens the newest five; another folds them closed.
  const { shown } = clusterSlice(top, state.spread, OPENED, 0);
  const left = total - shown.length;
  return (
    <View style={styles.comments} testID={`sparkler-comments-${card.id}`}>
      {shown.map((c, i) => (
        <OneComment
          key={c.id}
          postId={card.id}
          comment={c}
          replies={kids.get(c.id) ?? []}
          open={state.spread}
          showAll={state.open === i}
          onToggle={toggle}
          onReplies={() => toggleReplies(1, i)}
          ink={ink}
          stripe={stripe}
        />
      ))}
      {left > 0 ? (
        <Pressable onPress={state.spread ? () => openPost(card.id) : toggle} accessibilityRole="button" style={styles.moreRow}>
          <Text style={[styles.more, { color: ink.text }]}>{t('sparkler.more', { n: left })}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

const PostSquare = memo(function PostSquare({ card, index, tokens, bg, pinned, still, renderCard }: { card: Card; index: number; tokens: SparklerTokens; bg: SparklerBackground; pinned: boolean; still: boolean; renderCard: FeedLayoutProps['renderCard'] }) {
  const { t } = useLocale();
  const ref = useRef<Row>(null);
  const { grown, onLayout: growOnLayout } = useGrowWithScroll(ref, TIP_AT);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ink = useMemo(() => inkFor(bg), [bg]);
  const room = GLOW_REACH + 4;
  return (
    <View
      ref={ref}
      testID={`sparkler-${card.id}`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
        growOnLayout();
      }}>
      <View style={[styles.square, { backgroundColor: bg.base }]}>
        <BackgroundArt bg={bg} w={size.w} h={size.h} seed={index * 31 + 7} />
        <ProfilePic card={card} />
        {pinned ? <Text style={[styles.pinned, { color: ink.text }]}>{t('feed.pinned')}</Text> : null}
        <CardInk.Provider value={ink}>{renderCard(card.counts.comments > 0 ? { ...card, topComment: null } : card)}</CardInk.Provider>
        <Comments card={card} ink={ink} stripe={tokens.stripe} />
      </View>
      <Separator tokens={tokens} />
      {/* The line over the posts, grown as far as the member has scrolled, and the sparkler at its tip. */}
      {size.h ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.lineClip, { width: LINE_X + room, height: grown.interpolate({ inputRange: [0, 1], outputRange: [0, size.h] }) }]}>
            <Svg aria-hidden width={LINE_X + room} height={size.h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <GlassTube d={`M ${LINE_X} 0 L ${LINE_X} ${size.h}`} color={tokens.stripe} width={4} />
            </Svg>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            testID={`sparkler-tip-${card.id}`}
            style={[
              styles.tip,
              {
                opacity: grown.interpolate({ inputRange: [0, 0.001, 0.999, 1], outputRange: [0, 1, 1, 0] }),
                transform: [{ translateY: grown.interpolate({ inputRange: [0, 1], outputRange: [-SPARK_BOX / 2, size.h - SPARK_BOX / 2] }) }],
              },
            ]}>
            <Sparkler still={still} />
          </Animated.View>
        </>
      ) : null}
    </View>
  );
});

export function SparklerLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => sparklerTokens(theme), [theme]);
  const bg = useSparklerBackground();
  const still = useReducedMotion();
  const drawBus = useMemo(() => makeDrawBus(), []);
  // Room under the last post, so its line can grow all the way down to the tip.
  const tail = Math.round(Dimensions.get('window').height * (1 - TIP_AT)) + 40;
  return (
    <DrawBusContext.Provider value={drawBus}>
      <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="sparkler-layout">
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
          onScroll={drawBus.emit}
          scrollEventThrottle={16}
          onLayout={drawBus.emit}
          onContentSizeChange={drawBus.emit}
        />
      </View>
    </DrawBusContext.Provider>
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
  lineClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  tip: { position: 'absolute', left: LINE_X - SPARK_BOX / 2, top: 0, width: SPARK_BOX, height: SPARK_BOX },
  comments: { marginTop: space.md, gap: space.md },
  comment: { gap: space.xs },
  commentName: { fontWeight: '700', fontSize: 15 },
  commentText: { fontSize: type.body.fontSize + 1, lineHeight: type.body.lineHeight + 1 },
  replies: { borderLeftWidth: 3, paddingLeft: space.sm, marginLeft: space.sm, gap: space.xs, paddingVertical: 2 },
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
