// Ceramic Figurine (beta, behind Admin → Feed skins), Steve 2026-10-31: the "elegant retired
// lady version". Drawn from the Claude Design canvas "Ceramic Figurine feed":
//   * Pastel, light, nonglaring UNGLAZED ceramic decor on a soft lavender wall.
//   * Each post is a ceramic plaque with etched edges, set in a shadow box that stands on a
//     platform. Plaques, shadow boxes, platforms and placards GROW with their text (Steve
//     23:57): nothing has a fixed height.
//   * Angel figurines (every figure has wings) are workmen hauling each prayer up toward heaven
//     with ropes over a shiny white pulley in a cloud. When a post becomes the center of the
//     screen, its angel quietly lets go and presents it, like a game-show host showing a prize.
//     Every third post a little non-moving statue points at it. Now and then, as the center
//     moves on, an angel flies to the new center post.
//   * People pick their own style of figurines (five looks, or all five mixed).
//   * Comments hang from ceramic placards tied under the post. Closed: only the first comment's
//     first line reads, the stack behind it hidden. Tap: they flop down like plaques tied
//     together. Under each comment with replies, the first reply hangs exposed; a tap flops
//     the rest down, and tapping again folds them up. No "Fold up" plaques; replies never get a
//     Reply button (Steve, 2026-11-01).
//   * A ceramic turtle walks slowly across, BEHIND the cards (only seen in the gaps).
//   * All of the skin's own text is 1 pt bigger (Steve 23:57). The page only scrolls up and down.
// Reduced motion keeps everything still. Buttons, comments and paging come from the shared skin
// hooks (docs/SKIN_HOOKS.md); the post itself is the app's card, so its action row is the same.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Card, Comment, FeedTheme } from '@prayer-tower/shared';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { CardSurface } from '@/components/post-card';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { useFeedHooks } from '@/skins/feed-hooks';
import { useCommentActions, usePostComments } from '@/skins/comments';

import { Figurine, FIGURINE_LOOKS, type FigurineLook } from './ceramic-figurine';
import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';

const DEFAULTS = { backdrop: '#EAE6F1' };
type CeramicTokens = typeof DEFAULTS;

export function ceramicTokens(theme: FeedTheme | null): CeramicTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  return { backdrop: typeof t.backdrop === 'string' ? t.backdrop : DEFAULTS.backdrop };
}

/** The member's figurine style: one of the five looks, or all five mixed through the feed. */
export type FigurineChoice = FigurineLook | 'mix';
const CHOICES: FigurineChoice[] = ['mix', ...FIGURINE_LOOKS];
const STORE_KEY = 'ceramic.figurines';
/** Which posts count as on screen, for finding the one in the middle. */
const VIEWABILITY = { itemVisiblePercentThreshold: 10 };
/** A little statue points at every third post. */
const POINT_EVERY = 3;
/** At most this many comments flop down; the rest open on the post's page. */
const OPENED = 5;

const INK = '#4B3F47';
const SOFT_INK = '#64555E';
const ROPE = '#D9AF88';
const TINTS = ['#DCE6EF', '#F3DDD7', '#DDEADF', '#F2EBD2', '#E6DEF0'];
const SERIF = Platform.select({ web: "'Cormorant Garamond', Georgia, serif", default: 'Georgia' });
const BODY = Platform.select({ web: "'Lora', Georgia, serif", default: 'Georgia' });

/** The figurine for the n-th statue in the feed. */
export function lookAt(choice: FigurineChoice, n: number): FigurineLook {
  return choice === 'mix' ? FIGURINE_LOOKS[n % FIGURINE_LOOKS.length]! : choice;
}

// ---------------------------------------------------------------------------
// The haul over each post: a pulley in a cloud, the angel's rope, and the load line.

const SCENE_H = 116;
const ANGEL_W = 46;

function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M16 44h96a14 14 0 0 0-3-27.5A21 21 0 0 0 72 9a17 17 0 0 0-30 7A13.5 13.5 0 0 0 16 44Z" fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.2} />
      <Path d="M44 30q6-6 13 0M78 26q5-5 11 0" fill="none" stroke="#DED3DC" strokeWidth={1} />
    </G>
  );
}

function SmallCloud({ x }: { x: number }) {
  return <Path d={`M${x} 106h50a8 8 0 0 0-2-15.5 12 12 0 0 0-22-3 9 9 0 0 0-16 5A7.5 7.5 0 0 0 ${x} 106Z`} fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.1} />;
}

/** The pulley rig over one post, in real points across the screen's width (never stretched). */
function Haul({ w, left, pointer }: { w: number; left: boolean; pointer: boolean }) {
  const mid = w / 2;
  // The angel stands on a cloud at one side, hauling; the load line drops from the pulley's other side.
  const pull = left ? mid - 12 : mid + 12;
  const load = left ? mid + 12 : mid - 12;
  const hand = left ? 42 : w - 42;
  const tail = left ? 36 : w - 36;
  const dir = left ? -1 : 1;
  return (
    <Svg width={w} height={SCENE_H} style={styles.scene} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={`M${mid - 45} 22h90a11 11 0 0 0-2-21.6A17 17 0 0 0 ${mid + 13} -4a14 14 0 0 0-26 3A11 11 0 0 0 ${mid - 45} 22Z`} fill="#FBF8FB" stroke="#CFC1CE" strokeWidth={1.2} />
      <Rect x={mid - 4} y={12} width={8} height={14} rx={2} fill="#FFFFFF" stroke="#B9AEB6" strokeWidth={1} />
      {/* The hauling rope, from the pulley down to the angel's hands, its tail hanging with a tassel. */}
      <Path d={`M${pull} 27 L${hand} 53.5 L${tail} 57`} fill="none" stroke={ROPE} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={`M${pull} 27 L${hand} 53.5 L${tail} 57`} fill="none" stroke="#F6E7D3" strokeWidth={3.4} strokeDasharray="2.2 2.8" strokeLinejoin="round" />
      <Path d={`M${tail} 57 Q${tail + 7 * dir} 68 ${tail + 3 * dir} 80`} fill="none" stroke={ROPE} strokeWidth={3} strokeLinecap="round" />
      <Path d={`M${tail + 3 * dir} 79 l-3.5 9 h7 Z`} fill="#EBC6D0" stroke="#B88E9A" strokeWidth={0.9} />
      {/* The load line, its ring, and the bridle to the shadow box's two ropes. */}
      <Path d={`M${load} 27 V84`} fill="none" stroke={ROPE} strokeWidth={3.4} strokeLinecap="round" />
      <Path d={`M${load} 27 V84`} fill="none" stroke="#F6E7D3" strokeWidth={3.4} strokeDasharray="2.2 2.8" />
      <Path d={`M${load} 92 L40 112 M${load} 92 L${w - 40} 112`} fill="none" stroke={ROPE} strokeWidth={2.6} strokeLinecap="round" />
      <Path d={`M${load} 92 L40 112 M${load} 92 L${w - 40} 112`} fill="none" stroke="#F6E7D3" strokeWidth={2.6} strokeDasharray="2 2.6" />
      <Circle cx={load} cy={88} r={4} fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
      <Circle cx={load} cy={88} r={4} fill="none" stroke="#A99DA6" strokeWidth={0.6} />
      {/* The shiny, elegant white pulley. */}
      <Circle cx={mid} cy={26} r={13} fill="#F9F8FA" stroke="#A99DA6" strokeWidth={1.2} />
      <Circle cx={mid} cy={26} r={9.5} fill="#FFFFFF" stroke="#DCD5DA" strokeWidth={1.6} />
      <Path d={`M${mid} 17.5v17M${mid - 8.5} 26h17M${mid - 6} 20l12 12M${mid + 6} 20l-12 12`} stroke="#CFC6CC" strokeWidth={1.3} strokeLinecap="round" />
      <Circle cx={mid} cy={26} r={3} fill="#EBD9A6" stroke="#B89F62" strokeWidth={0.8} />
      <Path d={`M${mid - 9.5} 19.5a11.5 11.5 0 0 1 10-5.5`} fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={mid - 6.4} cy={18.6} r={1.3} fill="#FFFFFF" />
      {/* The clouds the figures stand on. */}
      <SmallCloud x={left ? 2 : w - 54} />
      {pointer ? <SmallCloud x={left ? w - 54 : 2} /> : null}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// A placard flopping down on its ties, like ceramic plaques tied together.

function Flop({ index, still, children }: { index: number; still: boolean; children: React.ReactNode }) {
  const turn = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return;
    Animated.timing(turn, { toValue: 1, duration: 760, delay: index * 140, easing: Easing.bezier(0.3, 1.2, 0.5, 1), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [turn, index, still]);
  const rotateX = turn.interpolate({ inputRange: [0, 0.6, 0.8, 1], outputRange: ['-100deg', '16deg', '-6deg', '0deg'] });
  const opacity = turn.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 1, 1] });
  return <Animated.View style={{ opacity, transform: [{ perspective: 700 }, { rotateX }] }}>{children}</Animated.View>;
}

function Ties({ inset }: { inset: number }) {
  return (
    <>
      <View style={[styles.tie, { left: inset }]} aria-hidden />
      <View style={[styles.tie, { right: inset }]} aria-hidden />
    </>
  );
}

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** A comment's own buttons: reply (top-level comments only), "this helped" and share. */
function PlacardButtons({ postId, comment, canReply }: { postId: string; comment: Comment; canReply: boolean }) {
  const { reply, helped, share } = useCommentActions(postId, comment);
  const one = (key: string, b: { name: string; press: () => void; on?: boolean }) => (
    <Pressable key={key} onPress={b.press} accessibilityRole="button" aria-pressed={key === 'helped' ? !!b.on : undefined} style={[styles.pill, b.on && styles.pillOn]}>
      <Text style={styles.pillText}>{b.name}</Text>
    </Pressable>
  );
  return (
    <View style={styles.pills}>
      {canReply ? one('reply', reply) : null}
      {helped ? one('helped', helped) : null}
      {share ? one('share', share) : null}
    </View>
  );
}

/** One comment's placard, and its replies: the first hanging exposed, the rest flopping down on a tap. */
function CommentPlacard({ card, comment, kids, index, still, onFold }: { card: Card; comment: Comment; kids: Map<string, Comment[]>; index: number; still: boolean; onFold: () => void }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const replies = useMemo(() => {
    // Every reply, however deep it was posted, in order (Steve: deal with all sub-comments).
    const out: Comment[] = [];
    const walk = (id: string) => {
      for (const r of kids.get(id) ?? []) {
        out.push(r);
        walk(r.id);
      }
    };
    walk(comment.id);
    return out;
  }, [kids, comment.id]);
  const first = replies[0];
  return (
    <Flop index={index} still={still}>
      <View style={styles.hang} testID={`ceramic-comment-${comment.id}`}>
        <Ties inset={34} />
        <View style={styles.placard}>
          <View style={styles.etch} aria-hidden />
          {/* Tapping a comment again folds the comments back up. */}
          <Pressable onPress={onFold} accessibilityRole="button" accessibilityLabel={`${comment.author.displayName}: ${comment.body}`} accessibilityHint={t('ceramic.foldComments')}>
            <View style={styles.row}>
              <View style={styles.smallOval}>
                <Text style={styles.smallInitials}>{initialsOf(comment.author.displayName)}</Text>
              </View>
              <Text style={styles.commentName}>{comment.author.displayName}</Text>
            </View>
            <Text style={styles.commentBody}>{comment.body}</Text>
          </Pressable>
          <PlacardButtons postId={card.id} comment={comment} canReply />
        </View>
        {first && !open ? (
          <View style={[styles.replyHang, replies.length > 1 && { paddingBottom: 6 }]}>
            <Ties inset={26} />
            {replies.length > 1 ? <View style={styles.replyBehind} aria-hidden /> : null}
            <Pressable onPress={() => setOpen(true)} accessibilityRole="button" aria-expanded={false} accessibilityLabel={`${first.author.displayName}: ${first.body}`} accessibilityHint={t('ceramic.showReplies', { count: replies.length })} style={styles.replyPlacard} testID={`ceramic-first-reply-${comment.id}`}>
              <View style={styles.replyEtch} aria-hidden />
              <Text style={styles.replyLine} numberOfLines={1}>
                <Text style={styles.replyNameInline}>{first.author.displayName}</Text> · {first.body}
              </Text>
              {replies.length > 1 ? <Text style={styles.more}>+{replies.length - 1}</Text> : null}
            </Pressable>
          </View>
        ) : null}
        {open ? (
          <View style={styles.replies}>
            {replies.map((r, ri) => (
              <Flop key={r.id} index={ri} still={still}>
                <View style={styles.replyHangOpen} testID={`ceramic-reply-${r.id}`}>
                  <Ties inset={26} />
                  <View style={styles.replyPlacardOpen}>
                    <View style={styles.replyEtch} aria-hidden />
                    {/* Tapping a reply folds the replies back up. */}
                    <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={`${r.author.displayName}: ${r.body}`} accessibilityHint={t('ceramic.foldReplies')}>
                      <Text style={styles.replyName}>{r.author.displayName}</Text>
                      <Text style={styles.replyBody}>{r.body}</Text>
                    </Pressable>
                    {/* Steve: sub-comments get no Reply button (overnesting is hard to follow). */}
                    <PlacardButtons postId={card.id} comment={r} canReply={false} />
                  </View>
                </View>
              </Flop>
            ))}
          </View>
        ) : null}
      </View>
    </Flop>
  );
}

/** The comments tied under a post: a closed stack, or up to five placards flopped down. */
function Placards({ card, still }: { card: Card; still: boolean }) {
  const { t } = useLocale();
  const { openPost } = useFeedHooks();
  const [open, setOpen] = useState(false);
  const { top, kids, total } = usePostComments(card, open || (card.counts.comments ?? 0) > 0);
  if (total <= 0 || top.length === 0) return null;
  const first = top[0]!;
  if (!open) {
    return (
      <View style={styles.stack} testID={`ceramic-stack-${card.id}`}>
        <Ties inset={34} />
        {total > 2 ? <View style={[styles.behind, { left: 12, right: 12, top: 24, backgroundColor: '#E3D7D4' }]} aria-hidden /> : null}
        {total > 1 ? <View style={[styles.behind, { left: 6, right: 6, top: 18, backgroundColor: '#EDE3E0' }]} aria-hidden /> : null}
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" aria-expanded={false} accessibilityLabel={t('ceramic.showComments', { count: total })} style={styles.placard} testID={`ceramic-open-${card.id}`}>
          <View style={styles.etch} aria-hidden />
          <View style={styles.row}>
            <View style={styles.smallOval}>
              <Text style={styles.smallInitials}>{initialsOf(first.author.displayName)}</Text>
            </View>
            <Text style={styles.closedLine} numberOfLines={1}>
              <Text style={styles.closedName}>{first.author.displayName}</Text> · {first.body}
            </Text>
            {total > 1 ? <Text style={styles.more}>+{total - 1}</Text> : null}
          </View>
        </Pressable>
      </View>
    );
  }
  const shown = top.slice(0, OPENED);
  const rest = total - shown.length;
  return (
    <View style={styles.opened}>
      {shown.map((c, i) => (
        <CommentPlacard key={c.id} card={card} comment={c} kids={kids} index={i} still={still} onFold={() => setOpen(false)} />
      ))}
      {rest > 0 ? (
        <Flop index={shown.length} still={still}>
          <View style={styles.hang}>
            <Ties inset={34} />
            <Pressable onPress={() => openPost(card.id)} accessibilityRole="button" style={styles.placard} testID={`ceramic-more-${card.id}`}>
              <View style={styles.etch} aria-hidden />
              <Text style={styles.moreLine}>{t('ceramic.more', { n: rest })}</Text>
            </Pressable>
          </View>
        </Flop>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

const PostRow = memo(function PostRow({
  card,
  index,
  width,
  choice,
  centered,
  pinned,
  still,
  renderCard,
}: {
  card: Card;
  index: number;
  width: number;
  choice: FigurineChoice;
  centered: boolean;
  pinned: boolean;
  still: boolean;
  renderCard: FeedLayoutProps['renderCard'];
}) {
  const { t } = useLocale();
  const left = index % 2 === 0;
  const pointer = index % POINT_EVERY === 1;
  // Each post's angel takes the next figurine; a pointing statue takes the one after.
  const n = index + Math.floor(index / POINT_EVERY);
  const angel = lookAt(choice, n);
  const statue = lookAt(choice, n + 1);
  const tint = TINTS[index % TINTS.length]!;
  // The plaque: the app's own card, in the plaque's pastel with its etched edges.
  const plaque = useMemo(() => ({ ...styles.plaque, backgroundColor: tint }), [tint]);
  return (
    <View style={styles.post} testID={`ceramic-${card.id}`}>
      {index % 5 === 1 || index % 5 === 4 ? (
        <Svg width={130} height={50} style={[styles.driftCloud, { top: '58%', [index % 2 ? 'right' : 'left']: -40 }]} aria-hidden>
          <Cloud x={0} y={0} />
        </Svg>
      ) : null}
      <Haul w={width} left={left} pointer={pointer} />
      <View style={[styles.figure, left ? { left: 4 } : { right: 4 }]} aria-hidden testID={centered ? 'ceramic-presenting' : undefined}>
        <Figurine look={angel} pose="pull" present={centered} flip={!left} width={ANGEL_W} />
      </View>
      {pointer ? (
        <View style={[styles.figure, left ? { right: 4 } : { left: 4 }]} aria-hidden>
          <Figurine look={statue} pose="stand" flip={left} width={ANGEL_W} />
        </View>
      ) : null}
      <View style={styles.hoist}>
        {/* The two ropes the shadow box hangs from. */}
        <View style={[styles.rope, { left: 38 }]} aria-hidden />
        <View style={[styles.rope, { right: 38 }]} aria-hidden />
        <View style={styles.box}>
          <View style={styles.boxWell}>
            {pinned ? <Text style={styles.pinned}>{t('feed.pinned')}</Text> : null}
            <View>
              <CardSurface.Provider value={plaque}>{renderCard(card.counts.comments > 0 ? { ...card, topComment: null } : card)}</CardSurface.Provider>
              <View style={styles.plaqueEtch} pointerEvents="none" aria-hidden />
              <View style={styles.plaqueDots} pointerEvents="none" aria-hidden />
            </View>
          </View>
        </View>
        {/* The platform the shadow box stands on, with its two brass pins. */}
        <View style={styles.platform} aria-hidden>
          <View style={styles.platformLip} />
          <View style={[styles.pin, { left: 10 }]} />
          <View style={[styles.pin, { right: 10 }]} />
        </View>
      </View>
      <Placards card={card} still={still} />
    </View>
  );
});

/** The ceramic turtle, walking slowly across behind the cards. */
function Turtle({ width, still }: { width: number; still: boolean }) {
  const x = useRef(new Animated.Value(-80)).current;
  useEffect(() => {
    if (still || !width) return;
    const walk = Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(x, { toValue: width + 10, duration: 25000, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }),
        Animated.delay(20000),
        Animated.timing(x, { toValue: -80, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    walk.start();
    return () => walk.stop();
  }, [x, width, still]);
  if (still) return null;
  return (
    <Animated.View style={[styles.turtle, { transform: [{ translateX: x }] }]} pointerEvents="none" aria-hidden testID="ceramic-turtle">
      <Svg width={64} height={36} viewBox="0 0 64 36">
        <Ellipse cx={31} cy={33} rx={25} ry={2.4} fill="#5A4652" opacity={0.15} />
        <Ellipse cx={18} cy={28} rx={4} ry={5} fill="#CFE0D2" stroke="#7F9F88" strokeWidth={0.9} />
        <Ellipse cx={44} cy={28} rx={4} ry={5} fill="#CFE0D2" stroke="#7F9F88" strokeWidth={0.9} />
        <Path d="M8 23.5 3 26.5 9 26.5Z" fill="#CFE0D2" stroke="#7F9F88" strokeWidth={0.9} strokeLinejoin="round" />
        <Circle cx={56} cy={19} r={6.2} fill="#D6E5D8" stroke="#7F9F88" strokeWidth={0.9} />
        <Ellipse cx={58.2} cy={17.4} rx={0.9} ry={1.2} fill="#45363B" />
        <Path d="M57 21.6q1.5 1 3 0" fill="none" stroke="#7F6A6E" strokeWidth={0.7} strokeLinecap="round" />
        <Circle cx={55.6} cy={21} r={1.3} fill="#F2B4AA" opacity={0.6} />
        <Path d="M9 25Q11 5 31 4.5Q51 5 53 25Z" fill="#CBE0D0" stroke="#7F9F88" strokeWidth={1} />
        <Path d="M25 11h12l4 7-4 7H25l-4-7Z" fill="none" stroke="#93B39C" strokeWidth={0.9} strokeLinejoin="round" />
        <Path d="M25 11 19 9M37 11l6-2M41 18h10M21 18H11M25 25l-3 0M37 25h3" fill="none" stroke="#93B39C" strokeWidth={0.9} strokeLinecap="round" />
        <Path d="M8 25.5H54" stroke="#ECDFC8" strokeWidth={3.2} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/** Now and then, as the center moves on, an angel flies from the old post to the new one. */
function FlyingAngel({ trip, height, width, choice }: { trip: { key: number; down: boolean; left: boolean } | null; height: number; width: number; choice: FigurineChoice }) {
  const go = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trip) return;
    go.setValue(0);
    Animated.timing(go, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [trip, go]);
  if (!trip || !height) return null;
  const x0 = trip.left ? 8 : width - 48;
  const from = trip.down ? 90 : height - 40;
  const to = height / 2;
  const translateY = go.interpolate({ inputRange: [0, 0.5, 1], outputRange: [from, (from + to) / 2, to] });
  const translateX = go.interpolate({ inputRange: [0, 0.5, 1], outputRange: [x0, x0 + (trip.left ? 70 : -70), x0 + (trip.left ? 6 : -6)] });
  const opacity = go.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] });
  return (
    <Animated.View style={[styles.flyer, { opacity, transform: [{ translateX }, { translateY }] }]} pointerEvents="none" aria-hidden>
      <Figurine look={lookAt(choice, trip.key)} pose="host" present flip={!trip.left} width={40} />
    </Animated.View>
  );
}

function Picker({ visible, choice, onPick, onClose }: { visible: boolean; choice: FigurineChoice; onPick: (c: FigurineChoice) => void; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={styles.sheet} accessibilityViewIsModal testID="ceramic-picker">
        <View style={styles.grip} aria-hidden />
        <Text style={styles.sheetTitle} role="heading">
          {t('ceramic.pickTitle')}
        </Text>
        <Text style={styles.sheetSub}>{t('ceramic.pickSub')}</Text>
        <View style={styles.grid}>
          {CHOICES.map((c) => (
            <Pressable key={c} onPress={() => onPick(c)} accessibilityRole="button" aria-pressed={c === choice} style={[styles.choice, c === choice && styles.choiceOn]} testID={`ceramic-pick-${c}`}>
              <Figurine look={c === 'mix' ? 'dove' : c} pose="sit" width={54} />
              <Text style={styles.choiceText}>{t(`ceramic.looks.${c}`)}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" style={styles.done}>
          <Text style={styles.doneText}>{t('common.close')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function CeramicLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => ceramicTokens(theme), [theme]);
  const still = useReducedMotion();
  const win = useWindowDimensions();
  const [laid, setSize] = useState({ w: 0, h: 0 });
  // Until the feed is laid out, the window's size.
  const size = { w: laid.w || win.width, h: laid.h || win.height };
  const [choice, setChoice] = useState<FigurineChoice>('mix');
  const [picking, setPicking] = useState(false);
  const [center, setCenter] = useState(-1);
  const [trip, setTrip] = useState<{ key: number; down: boolean; left: boolean } | null>(null);
  const flying = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((v) => {
        if (v && (CHOICES as string[]).includes(v)) setChoice(v as FigurineChoice);
      })
      .catch(() => undefined);
  }, []);
  const pick = useCallback((c: FigurineChoice) => {
    setChoice(c);
    AsyncStorage.setItem(STORE_KEY, c).catch(() => undefined);
  }, []);

  // The post nearest the middle of the screen is the one its angel presents.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const seen = viewableItems.filter((v) => typeof v.index === 'number').map((v) => v.index as number);
    if (!seen.length) return;
    const mid = seen[Math.floor((seen.length - 1) / 2)]!;
    setCenter((prev) => {
      if (prev !== mid && prev >= 0 && !flying.current && Math.random() < 0.5) {
        flying.current = true;
        setTrip({ key: mid, down: mid > prev, left: mid % 2 === 0 });
        setTimeout(() => {
          flying.current = false;
          setTrip(null);
        }, 3400);
      }
      return mid;
    });
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="ceramic-layout" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* Behind the list, so the turtle only shows in the gaps between the cards. */}
      <Turtle width={size.w} still={still} />
      {size.w ? (
        <FlatList
          data={cards}
          keyExtractor={(c) => c.id}
          style={styles.list}
          renderItem={({ item, index }) => (
            <PostRow card={item} index={index} width={size.w} choice={choice} centered={index === center} pinned={item.id === pinnedId} still={still} renderCard={renderCard} />
          )}
          ListHeaderComponent={
            <View style={styles.top}>
              <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={styles.pickButton} testID="ceramic-figurines">
                <Figurine look={choice === 'mix' ? 'angel' : choice} pose="sit" width={22} />
                <Text style={styles.pickText}>{t('ceramic.pickTitle')}</Text>
              </Pressable>
              {header ? <View style={styles.header}>{header}</View> : null}
            </View>
          }
          ListFooterComponent={atEnd && cards.length > 0 ? <Text style={styles.end}>{t('ceramic.end')}</Text> : <View style={{ height: 70 }} />}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY}
          // Up and down only: nothing in the feed moves sideways.
          horizontal={false}
          showsHorizontalScrollIndicator={false}
          {...feedListTuning}
        />
      ) : null}
      {still ? null : <FlyingAngel trip={trip} height={size.h} width={size.w} choice={choice} />}
      <Picker visible={picking} choice={choice} onPick={pick} onClose={() => setPicking(false)} />
    </View>
  );
}

const shadow = (y: number, r: number, o: number) =>
  Platform.select({
    web: { boxShadow: `0 ${y}px ${r}px rgba(70,50,60,${o})` },
    default: { shadowColor: '#46323C', shadowOpacity: o, shadowRadius: r / 2, shadowOffset: { width: 0, height: y } },
  });

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  list: { flex: 1, backgroundColor: 'transparent' },
  top: { paddingHorizontal: 12, paddingTop: 10 },
  header: { marginTop: 8 },
  pickButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: '#EDE3E6' },
  pickText: { fontFamily: BODY, fontSize: 15, color: INK },
  post: { position: 'relative', paddingTop: SCENE_H - 4, marginBottom: 30 },
  scene: { position: 'absolute', left: 0, top: 0 },
  driftCloud: { position: 'absolute' },
  figure: { position: 'absolute', top: 22, zIndex: 2 },
  hoist: { position: 'relative', paddingTop: 6 },
  rope: { position: 'absolute', top: 0, bottom: 52, width: 4, borderRadius: 2, backgroundColor: ROPE },
  box: { marginHorizontal: 50, zIndex: 1, backgroundColor: '#F1E4DF', borderRadius: 14, padding: 6, borderWidth: 1, borderColor: 'rgba(120,90,105,0.18)', ...shadow(5, 12, 0.16) },
  boxWell: { backgroundColor: '#E5DAD5', borderRadius: 9, padding: 7 },
  plaque: { borderRadius: 10, padding: 14, ...shadow(4, 7, 0.24) },
  plaqueEtch: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(95,70,85,0.32)' },
  plaqueDots: { position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, borderRadius: 5, borderWidth: 1, borderStyle: 'dotted', borderColor: 'rgba(95,70,85,0.3)' },
  pinned: { fontFamily: BODY, fontSize: 13, color: SOFT_INK, marginBottom: 4 },
  platform: { marginTop: -4, marginHorizontal: 26, height: 14, borderRadius: 6, backgroundColor: '#F8F1EC', borderBottomWidth: 4, borderBottomColor: '#EADDD7', zIndex: 1 },
  platformLip: { position: 'absolute', left: 6, right: 6, bottom: -3, height: 1, backgroundColor: 'rgba(95,70,85,0.25)' },
  pin: { position: 'absolute', top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E6CFA0' },
  tie: { position: 'absolute', top: 0, width: 3, height: 12, borderRadius: 2, backgroundColor: ROPE },
  stack: { position: 'relative', marginHorizontal: 52, paddingTop: 12, paddingBottom: 14 },
  behind: { position: 'absolute', bottom: 2, borderRadius: 10, ...shadow(3, 5, 0.2) },
  opened: { marginHorizontal: 52, paddingBottom: 6 },
  hang: { position: 'relative', paddingTop: 12 },
  placard: { position: 'relative', backgroundColor: '#F7F1EE', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, ...shadow(3, 6, 0.22) },
  etch: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(95,70,85,0.28)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallOval: { width: 24, height: 28, borderRadius: 12, backgroundColor: '#E5D9E3', alignItems: 'center', justifyContent: 'center' },
  smallInitials: { fontFamily: SERIF, fontWeight: '600', fontSize: 14, color: INK },
  closedLine: { flex: 1, minWidth: 0, fontFamily: BODY, fontSize: 15.5, lineHeight: 21, color: INK },
  closedName: { fontWeight: '500' },
  more: { fontFamily: BODY, fontSize: 14, color: SOFT_INK },
  moreLine: { fontFamily: BODY, fontSize: 15.5, color: INK, textAlign: 'center' },
  commentName: { flex: 1, fontFamily: SERIF, fontWeight: '600', fontSize: 18, color: INK },
  commentBody: { marginTop: 4, fontFamily: BODY, fontSize: 16, lineHeight: 23, color: INK },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  pill: { minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 16, backgroundColor: '#EDE3E6' },
  pillOn: { backgroundColor: '#D9C9D6' },
  pillText: { fontFamily: BODY, fontSize: 14, color: INK },
  replyHang: { position: 'relative', marginLeft: 22, paddingTop: 10 },
  replyBehind: { position: 'absolute', left: 7, right: 7, top: 18, bottom: 0, borderRadius: 9, backgroundColor: '#D9CFE6' },
  replyPlacard: { position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, minHeight: 44, backgroundColor: '#E6DEF0', ...shadow(3, 5, 0.2) },
  replyEtch: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(95,70,85,0.25)' },
  replyLine: { flex: 1, minWidth: 0, fontFamily: BODY, fontSize: 15, color: INK },
  replyNameInline: { fontFamily: SERIF, fontWeight: '600', fontSize: 16.5 },
  replies: { marginLeft: 22 },
  replyHangOpen: { position: 'relative', paddingTop: 10 },
  replyPlacardOpen: { position: 'relative', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, backgroundColor: '#E6DEF0', ...shadow(3, 5, 0.2) },
  replyName: { fontFamily: SERIF, fontWeight: '600', fontSize: 17, color: INK },
  replyBody: { fontFamily: BODY, fontSize: 15.5, lineHeight: 22, color: INK },
  turtle: { position: 'absolute', left: 0, bottom: 8, width: 64, height: 36 },
  flyer: { position: 'absolute', left: 0, top: 0, zIndex: 6 },
  end: { fontFamily: BODY, fontSize: 15, color: SOFT_INK, textAlign: 'center', paddingTop: 10, paddingBottom: 90, paddingHorizontal: 24 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(75,60,70,0.32)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#F6F0EE', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 24 },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D8CBD0', alignSelf: 'center', marginBottom: 10 },
  sheetTitle: { fontFamily: SERIF, fontWeight: '600', fontSize: 26, color: INK, textAlign: 'center' },
  sheetSub: { fontFamily: BODY, fontSize: 15, color: SOFT_INK, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  choice: { width: '30%', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 16, backgroundColor: '#EFE5E3', borderWidth: 2, borderColor: 'transparent' },
  choiceOn: { borderColor: '#8E7088' },
  choiceText: { fontFamily: BODY, fontSize: 14.5, color: INK, textAlign: 'center' },
  done: { marginTop: 14, height: 48, borderRadius: 24, backgroundColor: '#8E7088', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: BODY, fontSize: 18, color: '#FFFFFF' },
});
