// Neon Circuit comments (Steve, 2026-10-30): a post's comments are a loaded stack of
// screens the member flips through, branching from the post on a glass tube. Each
// comment's replies branch from that comment, and each reply's replies from the
// reply. Every comment sits on its own screen with its own row of icons, spaced out.
// The tubes draw themselves in as they scroll into view (lib/draw-in.ts).
import type { Card, Comment } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { GlassTube, GLOW_REACH, roundedBox, tubeShades } from '@/components/glass-tube';
import { commentTree } from '@/layouts/beanstalk';
import { api } from '@/lib/api';
import { useDrawIn, type Row } from '@/lib/draw-in';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { shareLink } from '@/lib/links';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

import { glow, textOn } from './motifs';

type Tokens = { backdrop: string; wire: string; screen: string };

/** How far each level sits in from its parent, and where its branch runs down. */
const INDENT = 30;
const SPINE = 22;
/** Room round a frame for the tube's glow. */
const ROOM = GLOW_REACH + 4;
/** Screens shown waiting behind the front comment, at most. */
const STACKED = 3;
/** How far each screen in the stack sits behind the one in front. */
const STEP = 12;
/** Replies shown under each comment before "n more". */
const REPLIES = 3;

const ART = {
  reply: require('../../assets/images/actions/encouragement.png'),
  helped: require('../../assets/images/actions/well_wishes.png'),
  share: require('../../assets/images/actions/share.png'),
};

/** One comment's row of icons: reply, "this helped" and share. */
function Icons({ postId, comment }: { postId: string; comment: Comment }) {
  const { t } = useLocale();
  const { thisHelped, shareConsent } = useFeatures();
  const [helped, setHelped] = useState(!!comment.helped);
  const icon = (key: keyof typeof ART, label: string, onPress: () => void, on = false) => (
    <Pressable key={key} onPress={onPress} accessibilityRole="button" aria-label={label} aria-pressed={key === 'helped' ? on : undefined} style={[styles.icon, on && styles.iconOn]} hitSlop={6}>
      <Image source={ART[key]} style={styles.iconArt} />
    </Pressable>
  );
  return (
    <View style={styles.icons}>
      {icon('reply', t('post.reply'), () => router.push({ pathname: '/post/[id]', params: { id: postId, comment: comment.id } }))}
      {thisHelped && !comment.isMine
        ? icon(
            'helped',
            t('kindNorms.helped'),
            () => {
              const next = !helped;
              setHelped(next);
              api.setHelped(comment.id, next).catch(() => setHelped(!next));
            },
            helped,
          )
        : null}
      {!shareConsent || comment.isMine
        ? icon('share', t('post.share'), () =>
            Share.share({ message: t('post.shareComment', { body: comment.body, name: comment.author.displayName, url: shareLink(`/post/${postId}`, { comment: comment.id }) }) }).catch(() => undefined),
          )
        : null}
    </View>
  );
}

/**
 * One comment on its own screen, with the branch that feeds it: down from its parent at
 * SPINE, then across into the screen. `through` carries the branch on past this screen
 * to the next sibling. `stacked` draws that many screens waiting behind it.
 */
function NeonComment({
  postId,
  comment,
  tokens,
  depth,
  through,
  stacked = 0,
  flip,
  header,
  lift = 0,
  children,
}: {
  postId: string;
  comment: Comment;
  tokens: Tokens;
  depth: number;
  through: boolean;
  stacked?: number;
  flip?: Animated.Value;
  header?: React.ReactNode;
  lift?: number;
  children?: React.ReactNode;
}) {
  const ref = useRef<Row>(null);
  const { drawn, onLayout } = useDrawIn(ref, 1200);
  const [wrap, setWrap] = useState({ h: 0 });
  const [box, setBox] = useState({ y: 0, w: 0, h: 0 });
  const mid = box.y + box.h / 2;
  const reach = through ? wrap.h : mid;
  const tube = depth === 0 ? 6 : 4;
  // The branch starts inside the parent's tube, past any stack waiting behind the parent.
  const up = 8 + lift;
  return (
    <View
      ref={ref}
      style={styles.item}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (Math.abs(h - wrap.h) > 1) setWrap({ h });
        onLayout();
      }}>
      {/* The branch: down from the parent, then across into this screen. */}
      {box.h ? (
        <Animated.View pointerEvents="none" style={[styles.clip, { left: -INDENT + SPINE - ROOM, top: -up, width: INDENT - SPINE + ROOM * 2, height: drawn.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, reach + up + ROOM, reach + up + ROOM] }) }]}>
          <Svg aria-hidden width={INDENT - SPINE + ROOM * 2} height={reach + up + ROOM} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GlassTube d={`M ${ROOM} 0 L ${ROOM} ${mid + up} L ${INDENT - SPINE + ROOM + 4} ${mid + up}${through ? ` M ${ROOM} ${mid + up} L ${ROOM} ${reach + up}` : ''}`} color={depth === 0 ? tokens.screen : tokens.wire}
              width={tube}
              // Out of a red post the branch leaves red, shading gradually to blue.
              blend={depth === 0 ? { to: tokens.wire, y1: up, y2: Math.max(mid, 40) } : undefined}
            />
            <Circle cx={ROOM} cy={mid + up} r={tube - 0.5} fill={tubeShades(tokens.wire).core} />
          </Svg>
        </Animated.View>
      ) : null}
      {header}
      <View
        style={[styles.stackRoom, { marginBottom: stacked * STEP }]}
        onLayout={(e) => {
          const { y, width, height } = e.nativeEvent.layout;
          if (Math.abs(height - box.h) > 1 || Math.abs(width - box.w) > 1 || Math.abs(y - box.y) > 1) setBox({ y, w: width, h: height });
        }}>
        {/* The loaded stack: screens waiting behind, each a step further down and to the right. */}
        {box.w
          ? Array.from({ length: stacked }, (_, i) => stacked - i).map((n) => (
              <Animated.View key={n} pointerEvents="none" style={[styles.ghost, { left: n * STEP - ROOM, top: n * STEP - ROOM, opacity: drawn.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0, 1 - n * 0.2] }) }]}>
                <Svg aria-hidden width={box.w + ROOM * 2} height={box.h + ROOM * 2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {/* A whole screen waiting: dark glass inside its own tube, overlapped by the one in front. */}
                  <Path d={roundedBox(box.w + ROOM * 2, box.h + ROOM * 2, 14, ROOM + 2)} fill={tubeShades(tokens.wire).edge} fillOpacity={0.35} />
                  <GlassTube d={roundedBox(box.w + ROOM * 2, box.h + ROOM * 2, 14, ROOM + 2)} color={tokens.wire} width={4} />
                </Svg>
              </Animated.View>
            ))
          : null}
        <Animated.View
          style={[
            styles.screen,
            flip && { transformOrigin: 'top', transform: [{ perspective: 800 }, { rotateX: flip.interpolate({ inputRange: [-1, 0, 1], outputRange: ['80deg', '0deg', '-80deg'] }) }], opacity: flip.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }) },
          ]}>
          {/* The screen's tube, top first; its words fade in once it is drawn. */}
          {box.w ? (
            <Animated.View pointerEvents="none" style={[styles.clip, { left: -ROOM, top: -ROOM, width: box.w + ROOM * 2, height: drawn.interpolate({ inputRange: [0, 0.35, 0.8, 1], outputRange: [0, 0, box.h + ROOM * 2, box.h + ROOM * 2] }) }]}>
              <Svg aria-hidden width={box.w + ROOM * 2} height={box.h + ROOM * 2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <GlassTube d={roundedBox(box.w + ROOM * 2, box.h + ROOM * 2, 14, ROOM + 2)} color={tokens.wire} width={depth === 0 ? 5 : 4} />
              </Svg>
            </Animated.View>
          ) : null}
          <Animated.View style={[styles.glass, { opacity: drawn.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 0, 1] }) }]} testID={`circuit-comment-${comment.id}`}>
            <Text style={styles.author}>{comment.author.displayName}</Text>
            <Text style={type.body}>{comment.body}</Text>
            <Icons postId={postId} comment={comment} />
          </Animated.View>
        </Animated.View>
      </View>
      {children}
    </View>
  );
}

/** A comment's replies, each branching from it, and theirs from them. */
function Replies({ postId, parent, kids, tokens, depth, lift = 0 }: { postId: string; parent: Comment; kids: Map<string, Comment[]>; tokens: Tokens; depth: number; lift?: number }) {
  const { t } = useLocale();
  const all = kids.get(parent.id) ?? [];
  if (!all.length) return null;
  const shown = all.slice(0, REPLIES);
  const more = all.length - shown.length;
  return (
    <View style={styles.level}>
      {shown.map((c, i) => (
        <NeonComment key={c.id} postId={postId} comment={c} tokens={tokens} depth={depth} through={i < shown.length - 1} lift={i === 0 ? lift : 0}>
          <Replies postId={postId} parent={c} kids={kids} tokens={tokens} depth={depth + 1} />
        </NeonComment>
      ))}
      {more > 0 ? (
        <Text style={[styles.more, { color: tubeShades(tokens.wire).inner }]} accessibilityRole="link" onPress={() => router.push({ pathname: '/post/[id]', params: { id: postId, comment: parent.id } })}>
          {t('circuit.more', { n: more })}
        </Text>
      ) : null}
    </View>
  );
}

/** The post's comments as a stack branching from it. Nothing when it has none. */
export function CommentStack({ card, tokens, start }: { card: Card; tokens: Tokens; start: number }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const [all, setAll] = useState<Comment[] | null>(null);
  const [at, setAt] = useState(0);
  const flip = useRef(new Animated.Value(0)).current;
  const count = card.counts.comments ?? 0;
  useEffect(() => {
    if (count <= 0) return;
    let live = true;
    api
      .comments(card.id)
      .then((r) => live && setAll(r.comments))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [card.id, count]);
  // Until the comments arrive, the newest few the feed already sent.
  const fallback = useMemo(() => (card.leafComments ?? []).map((c) => ({ ...c, parentId: c.parentId ?? null })), [card.leafComments]);
  const { top, kids } = useMemo(() => commentTree(all ?? fallback), [all, fallback]);
  if (!top.length) return null;
  const i = Math.min(at, top.length - 1);
  const front = top[i]!;
  const go = (step: 1 | -1) => {
    const next = i + step;
    if (next < 0 || next >= top.length) return;
    if (reduced) return setAt(next);
    // The front screen flips away, the next one flips in from the stack.
    Animated.timing(flip, { toValue: step, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => {
      setAt(next);
      flip.setValue(-step);
      Animated.timing(flip, { toValue: 0, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    });
  };
  const lit = tubeShades(tokens.wire);
  const arrow = (step: 1 | -1, label: string, glyph: string) => {
    const off = step < 0 ? i === 0 : i >= top.length - 1;
    return (
      <Pressable onPress={() => go(step)} disabled={off} accessibilityRole="button" aria-label={label} style={[styles.arrow, { borderColor: lit.body }, !off && glow(tokens.wire, 8), off && styles.arrowOff]} hitSlop={6}>
        <Text style={[styles.arrowText, { color: lit.core }]}>{glyph}</Text>
      </Pressable>
    );
  };
  return (
    <View style={{ marginLeft: start + INDENT }} testID={`circuit-comments-${card.id}`}>
      <NeonComment
        postId={card.id}
        comment={front}
        tokens={tokens}
        depth={0}
        through={false}
        stacked={Math.min(top.length - 1 - i, STACKED)}
        flip={flip}
        header={
          top.length > 1 ? (
            <View style={styles.flipRow}>
              {arrow(-1, t('circuit.prev'), '‹')}
              <Text style={[type.small, { color: textOn(tokens.backdrop) }]}>{t('circuit.position', { n: i + 1, total: top.length })}</Text>
              {arrow(1, t('circuit.next'), '›')}
            </View>
          ) : null
        }>
        <Replies postId={card.id} parent={front} kids={kids} tokens={tokens} depth={1} lift={Math.min(top.length - 1 - i, STACKED) * STEP} />
      </NeonComment>
    </View>
  );
}

const styles = StyleSheet.create({
  level: { marginLeft: INDENT },
  item: { position: 'relative', paddingTop: space.lg },
  clip: { position: 'absolute', overflow: 'hidden' },
  stackRoom: { position: 'relative', marginRight: STACKED * STEP },
  ghost: { position: 'absolute' },
  screen: { borderRadius: radius.md, padding: 7 },
  glass: { borderRadius: radius.sm, backgroundColor: colors.surface, padding: space.md, gap: space.xs },
  author: { ...type.small, fontWeight: '700', color: colors.text },
  icons: { flexDirection: 'row', gap: space.xl, marginTop: space.sm, alignItems: 'center' },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconOn: { backgroundColor: colors.primarySoft },
  iconArt: { width: 28, height: 28 },
  flipRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  arrow: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  arrowOff: { opacity: 0.35 },
  arrowText: { fontSize: 22, lineHeight: 24, fontWeight: '700' },
  more: { ...type.small, fontWeight: '700', marginTop: space.md, marginLeft: INDENT },
});
