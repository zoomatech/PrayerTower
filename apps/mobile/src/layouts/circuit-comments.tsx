// Neon Circuit comments (Steve, 2026-10-30): a post's comments are a loaded stack of
// red neon cards, each flipped forward onto its face, coming out of the (blue) post on a
// red glass tube. A face-down card shows its author and first line; tapped, it opens out,
// its tube draws all the way round, and it pushes the neon below it down. An open
// comment's replies branch from it, and each reply's replies from the reply, every one on
// its own card with its own row of icons. The tubes draw themselves in as they scroll
// into view (lib/draw-in.ts).
import type { Card, Comment } from '@prayer-tower/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { GlassTube, GLOW_REACH, roundedBox, tubeShades } from '@/components/glass-tube';
import { boxRuns, Sparkles } from '@/components/sparkles';
import { useDrawIn, type Row } from '@/lib/draw-in';
import { useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';
import { useFeedHooks } from '@/skins/feed-hooks';
import { clusterSlice, useCommentActions, useCommentCluster, usePostComments } from '@/skins/comments';


type Tokens = { backdrop: string; wire: string; screen: string };

/** Comments under comments glow violet (Steve, 2026-10-30); the post's own comments red. */
const VIOLET = '#B44CFF';

/** How far each level sits in from its parent, and where its branch runs down. */
const INDENT = 30;
const SPINE = 22;
/** Room round a frame for the tube's glow. */
const ROOM = GLOW_REACH + 4;
/** Comments shown when a cluster opens, and lines receding behind a closed one. */
const OPENED = 5;
const RECESSION = 4;
/** A face-down card's height, and its tilt. */
const SHUT = 50;
const TILT = '42deg';

const ART = {
  reply: require('../../assets/images/actions/encouragement.png'),
  helped: require('../../assets/images/actions/well_wishes.png'),
  share: require('../../assets/images/actions/share.png'),
};

/** One comment's row of icons: reply, "this helped" and share (what they do: skins/comments.ts). */
function Icons({ postId, comment }: { postId: string; comment: Comment }) {
  const { reply, helped, share } = useCommentActions(postId, comment);
  const icon = (key: keyof typeof ART, b: { name: string; press: () => void; on?: boolean }) => (
    <Pressable key={key} onPress={b.press} accessibilityRole="button" aria-label={b.name} aria-pressed={key === 'helped' ? !!b.on : undefined} style={[styles.icon, b.on && styles.iconOn]} hitSlop={6}>
      <Image source={ART[key]} style={styles.iconArt} />
    </Pressable>
  );
  return (
    <View style={styles.icons}>
      {icon('reply', reply)}
      {helped ? icon('helped', helped) : null}
      {share ? icon('share', share) : null}
    </View>
  );
}

/**
 * One comment on its own red neon card, with the branch that feeds it: down from its parent
 * at SPINE, then across into the card. `through` carries the branch on past this card to the
 * next one. A `foldable` card lies face down until it is opened.
 */
function NeonComment({
  postId,
  comment,
  tokens,
  through,
  foldable = false,
  color,
  open = true,
  onToggle,
  children,
}: {
  postId: string;
  comment: Comment;
  tokens: Tokens;
  through: boolean;
  foldable?: boolean;
  /** The card's neon; the post's own comments are red. */
  color?: string;
  open?: boolean;
  onToggle?: () => void;
  children?: React.ReactNode;
}) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const ref = useRef<Row>(null);
  const { drawn, onLayout } = useDrawIn(ref, 1200);
  const [wrap, setWrap] = useState({ h: 0 });
  const [box, setBox] = useState({ y: 0, w: 0, h: 0 });
  const [full, setFull] = useState(0);
  // 0 face down, 1 opened out; `trace` redraws the card's tube all the way round as it opens.
  // A card that appears as its cluster opens unfolds from face down too.
  const unfold = useRef(new Animated.Value(foldable ? 0 : 1)).current;
  const trace = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!foldable) return;
    if (reduced) return unfold.setValue(open ? 1 : 0);
    if (open) trace.setValue(0);
    Animated.parallel([
      Animated.timing(unfold, { toValue: open ? 1 : 0, duration: 450, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.timing(trace, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [open, foldable, reduced, unfold, trace]);
  const red = color ?? tokens.screen;
  const mid = box.y + (foldable ? SHUT / 2 : box.h / 2);
  const reach = through ? wrap.h : mid;
  const up = 8;
  const frameH = box.h + ROOM * 2;
  const words = (
    <>
      <Text style={styles.author} numberOfLines={open ? undefined : 1}>
        {comment.author.displayName}
        {open ? null : <Text style={styles.firstLine}>{`  ${comment.body}`}</Text>}
      </Text>
      {open ? (
        <>
          <Text style={type.body}>{comment.body}</Text>
          <Icons postId={postId} comment={comment} />
        </>
      ) : null}
    </>
  );
  return (
    <View
      ref={ref}
      style={styles.item}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (Math.abs(h - wrap.h) > 1) setWrap({ h });
        onLayout();
      }}>
      {/* The branch: down from the parent, then across into this card. */}
      {box.h ? (
        <Animated.View pointerEvents="none" style={[styles.clip, { left: -INDENT + SPINE - ROOM, top: -up, width: INDENT - SPINE + ROOM * 2, height: drawn.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, reach + up + ROOM, reach + up + ROOM] }) }]}>
          <Svg aria-hidden width={INDENT - SPINE + ROOM * 2} height={reach + up + ROOM} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GlassTube d={`M ${ROOM} 0 L ${ROOM} ${mid + up} L ${INDENT - SPINE + ROOM + 4} ${mid + up}${through ? ` M ${ROOM} ${mid + up} L ${ROOM} ${reach + up}` : ''}`} color={red} width={4} />
            <Circle cx={ROOM} cy={mid + up} r={3.5} fill={tubeShades(red).core} />
          </Svg>
        </Animated.View>
      ) : null}
      {box.h ? <Sparkles runs={[{ x1: -INDENT + SPINE, y1: -up, x2: -INDENT + SPINE, y2: mid }, { x1: -INDENT + SPINE, y1: mid, x2: 0, y2: mid }]} color={red} /> : null}
      <Animated.View
        style={[
          styles.screen,
          foldable && {
            // Face down, the card leans forward onto its face; open, it stands up and grows to its full height.
            height: full ? unfold.interpolate({ inputRange: [0, 1], outputRange: [SHUT, full] }) : open ? undefined : SHUT,
            transformOrigin: 'bottom',
            transform: [{ perspective: 700 }, { rotateX: unfold.interpolate({ inputRange: [0, 1], outputRange: [TILT, '0deg'] }) }],
          },
        ]}
        onLayout={(e) => {
          const { y, width, height } = e.nativeEvent.layout;
          if (Math.abs(height - box.h) > 1 || Math.abs(width - box.w) > 1 || Math.abs(y - box.y) > 1) setBox({ y, w: width, h: height });
        }}>
        {/* The card's tube, top first; its words fade in once it is drawn. */}
        {box.w ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.clip, { left: -ROOM, top: -ROOM, width: box.w + ROOM * 2, height: Animated.multiply(drawn.interpolate({ inputRange: [0, 0.35, 0.8, 1], outputRange: [0, 0, 1, 1] }), trace).interpolate({ inputRange: [0, 1], outputRange: [0, frameH] }) }]}>
            <Svg aria-hidden width={box.w + ROOM * 2} height={frameH} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <GlassTube d={roundedBox(box.w + ROOM * 2, frameH, 14, ROOM + 2)} color={red} width={foldable ? 5 : 4} />
            </Svg>
          </Animated.View>
        ) : null}
        {box.w && open ? <Sparkles runs={boxRuns(box.w, box.h, 2)} color={red} /> : null}
        <Animated.View style={[styles.glassClip, { opacity: drawn.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 0, 1] }) }]}>
          {foldable ? (
            <Pressable onPress={onToggle} accessibilityRole="button" aria-expanded={open} aria-label={`${comment.author.displayName}: ${comment.body}`} accessibilityHint={open ? t('circuit.fold') : t('circuit.open')}>
              <View
                style={styles.glass}
                testID={`circuit-comment-${comment.id}`}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height + 14;
                  if (open && Math.abs(h - full) > 1) setFull(h);
                }}>
                {words}
              </View>
            </Pressable>
          ) : (
            <View style={styles.glass} testID={`circuit-comment-${comment.id}`}>
              {words}
            </View>
          )}
        </Animated.View>
      </Animated.View>
      {open ? children : null}
    </View>
  );
}

/** A comment's replies: a cluster of their own branching from it, closed until tapped. */
function Replies({ postId, parent, kids, tokens }: { postId: string; parent: Comment; kids: Map<string, Comment[]>; tokens: Tokens }) {
  const all = kids.get(parent.id) ?? [];
  if (!all.length) return null;
  return (
    <View style={styles.level}>
      <Cluster postId={postId} list={all} kids={kids} tokens={tokens} color={VIOLET} at={parent.id} />
    </View>
  );
}

function MoreLink({ postId, at, color, label }: { postId: string; at: string; n: number; color: string; label: string }) {
  const { openPost } = useFeedHooks();
  return (
    <Text style={[styles.more, { color: tubeShades(color).inner }]} accessibilityRole="link" onPress={() => openPost(postId, at || undefined)}>
      {label}
    </Text>
  );
}

/** The post's comments as a cluster branching from it. Nothing when it has none. */
export function CommentStack({ card, tokens, start }: { card: Card; tokens: Tokens; start: number }) {
  const { top, kids } = usePostComments(card);
  if (!top.length) return null;
  return (
    <View style={{ marginLeft: start + INDENT }} testID={`circuit-comments-${card.id}`}>
      <Cluster postId={card.id} list={top} kids={kids} tokens={tokens} color={tokens.screen} at="" />
    </View>
  );
}

/**
 * A cluster of comments, or of one comment's replies. Closed: only the first, face down
 * with its first line showing, and the rest as a fading recession of neon lines behind it.
 * Open: the first five, whole, each with its own replies as a closed cluster of their own.
 */
function Cluster({ postId, list, kids, tokens, color, at }: { postId: string; list: Comment[]; kids: Map<string, Comment[]>; tokens: Tokens; color: string; at: string }) {
  const { t } = useLocale();
  const { state, toggle } = useCommentCluster();
  const open = state.spread;
  const { shown, behind, more } = clusterSlice(list, open, OPENED, RECESSION);
  return (
    <View style={styles.cluster}>
      {shown.map((c, i) => (
        <NeonComment key={c.id} postId={postId} comment={c} tokens={tokens} color={color} through={i < shown.length - 1} foldable open={open} onToggle={toggle}>
          <Replies postId={postId} parent={c} kids={kids} tokens={tokens} />
        </NeonComment>
      ))}
      {behind ? (
        <Pressable onPress={toggle} accessibilityRole="button" aria-label={t('circuit.cluster', { n: list.length })}>
          <Recession n={behind} color={color} />
        </Pressable>
      ) : null}
      {more > 0 ? <MoreLink postId={postId} at={at} n={more} color={color} label={t('circuit.more', { n: more })} /> : null}
    </View>
  );
}

/** The comments waiting in a closed cluster: neon lines receding behind the top one, each shorter and fainter. */
function Recession({ n, color }: { n: number; color: string }) {
  const [w, setW] = useState(0);
  const gap = 9;
  const h = n * gap + ROOM;
  return (
    <View style={{ height: h, marginTop: -4 }} onLayout={(e) => setW(e.nativeEvent.layout.width)} pointerEvents="none">
      {w ? (
        <Svg aria-hidden width={w} height={h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: n }, (_, i) => {
            const inset = 16 + i * 14;
            const y = (i + 1) * gap;
            return (
              <G key={i} opacity={0.75 - i * 0.16}>
                <GlassTube d={`M ${inset} ${y} L ${w - inset} ${y}`} color={color} width={3} />
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  level: { marginLeft: INDENT },
  cluster: { marginTop: space.lg },
  item: { position: 'relative', paddingTop: space.xl },
  clip: { position: 'absolute', overflow: 'hidden' },
  screen: { borderRadius: radius.md, padding: 7 },
  glassClip: { flex: 1, borderRadius: radius.sm, overflow: 'hidden' },
  glass: { borderRadius: radius.sm, backgroundColor: colors.surface, paddingVertical: space.sm, paddingHorizontal: space.md, gap: space.xs },
  author: { ...type.small, fontWeight: '700', color: colors.text },
  firstLine: { fontWeight: '400', color: colors.textMuted },
  icons: { flexDirection: 'row', gap: space.xl, marginTop: space.sm, alignItems: 'center' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: colors.primarySoft },
  iconArt: { width: 28, height: 28 },
  more: { ...type.small, fontWeight: '700', marginTop: space.md },
});
