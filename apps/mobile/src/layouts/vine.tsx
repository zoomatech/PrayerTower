// Vine 2.0: the community is one plant. It grows top to bottom, present to
// past: each request sits inside a pointed leaf, and a curving drawn vine
// (components/vine-flow.tsx) swoops from leaf to leaf, alternating sides,
// through wide open space. A dot at the top of each leaf shows ripeness.
// Your own requests grow on your branch (and all of them on the Your branch
// screen), a tendril curls toward each request for every promise to pray (yours
// in the tendril color), answered requests bloom, and scripture leaves ("abide in the vine") sit
// between the fruit. The stem is the scroll indicator, the feed ends at a
// resting vine tip, and if the screen sits idle a bird snips off a would-be
// ad bud. Colors, spacing and copy come from the theme's tokens, so the look
// can change without an app release. Reduced motion turns the animations off.
// Skins (Beanstalk, Golden Wood, Moonlit Gate) are the same vine with other
// tokens: a backdrop, a thicker or doubled stem and round or pointed leaves.
import { COMMENT_TEXT, contrastRatio, type Card, type Comment, type FeedTheme, type PostState } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { BlurredLeaves } from '@/components/comment-tree';
import { CardSurface } from '@/components/post-card';
import { GateArch } from '@/components/gate-arch';
import { isLit, leafCardSurface, LeafFrame, VINE_GAP, VineRow, type VineSide, type VineStyle } from '@/components/vine-flow';
import { api } from '@/lib/api';
import { Tr, useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';
import { isDark, LeafMark, NeonScene, SCENES, textOn, type SceneKind } from './motifs';
import { hashId } from './placement';

// The branch color as text: darker, for 4.5:1 contrast on the card (WCAG AA).
const BRANCH_TEXT = '#6B5435';

const DEFAULTS = {
  stem: '#6E8B4E',
  leaf: '#A9C08A',
  leafSoft: '#EEF3E6',
  branch: '#8A6E4B',
  tendril: colors.primary,
  leafEvery: 4,
  idleBirdSeconds: 25,
  birdText: 'Uh-uh! No ads here. Just people and prayer.',
  tipText: 'You have reached the tip of the vine. Rest a moment, or come back later to see it grow.',
  /** Feed background; empty keeps the screen's own. */
  backdrop: '',
  stemWidth: 4,
  /** Two thin parallel lines instead of one stem (Moonlit Gate's silver tracery). */
  stemDouble: false,
  /**
   * 'flower' (Blossom Garden) and 'star' (Neon Cinderella) draw a mark from
   * motifs.tsx; 'tablet' is for comment trees on the Prayer Tower.
   */
  leafShape: 'round' as LeafShape,
  /** A neon glow on the stem. */
  stemGlow: false,
  /** 'fairytale' puts neon outline drawings between the requests (Neon Cinderella). */
  scenery: '',
  /** How the plant is drawn: '' (one stalk), 'beanstalk' (twisting strands), 'ink' (pen-and-ink), 'neon' (glowing rods, no plant), 'gate' (lines of silver light under a drawn gate). */
  vineStyle: '' as VineStyle,
  /** Outline color for the 'ink' style. */
  ink: '',
};
type VineTokens = typeof DEFAULTS;
export const LEAF_SHAPES = ['round', 'pointed', 'flower', 'star', 'tablet'] as const;
export type LeafShape = (typeof LEAF_SHAPES)[number];
const VINE_STYLES: VineStyle[] = ['', 'beanstalk', 'ink', 'neon', 'gate', 'floral'];

/** Theme tokens override the defaults key by key; wrong types are ignored. */
export function vineTokens(theme: FeedTheme | null): VineTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof t[k] === typeof v) out[k] = t[k];
  out.stemWidth = Math.min(Math.max(Number(out.stemWidth) || DEFAULTS.stemWidth, 2), 14);
  if (!LEAF_SHAPES.includes(out.leafShape as LeafShape)) out.leafShape = 'round';
  if (!VINE_STYLES.includes(out.vineStyle as VineStyle)) out.vineStyle = '';
  return out as VineTokens;
}

const ripeness: Record<PostState, string> = {
  open: '#9BC59D',
  actively_prayed: '#E6C35C',
  amplified: '#E8964A',
  answered: colors.gold,
};


interface Leaf {
  id: string;
  reference: string;
  text: string;
  translation: string | null;
}

type Item = (
  | { kind: 'fruit'; card: Card; side: VineSide; gap: number }
  | { kind: 'comment'; comment: Comment; postId: string; side: VineSide; key: string }
  | { kind: 'more'; postId: string; count: number; side: VineSide; key: string }
  | { kind: 'leaf'; leaf: Leaf; key: string }
  | { kind: 'scene'; scene: SceneKind; key: string }
  | { kind: 'gate'; key: string }
) & {
  /** The side the vine is coming from (the leaf above), or null at the top. */
  from: VineSide | null;
};

/** How many tendrils a fruit shows at most; the label carries the real count. */
const MAX_TENDRILS = 5;
/** Space above a comment leaf: closer than between requests, so they read as the request's own. */
const COMMENT_GAP = 26;

function Fruit({ card, pinned, tokens, side, from, gap, fresh, children }: { card: Card; pinned: boolean; tokens: VineTokens; side: VineSide; from: VineSide | null; gap: number; fresh: boolean; children: React.ReactNode }) {
  const { t } = useLocale();
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  // The tags sit on the leaf: keep each tag color only where it reads at 4.5:1 there (WCAG AA).
  const under = isLit(tokens.vineStyle) ? tokens.backdrop || '#0B0820' : tokens.leaf;
  const on = (color: string) => (/^#[0-9A-Fa-f]{6}$/.test(color) && /^#[0-9A-Fa-f]{6}$/.test(under) && contrastRatio(color, under) >= 4.5 ? color : textOn(under));
  useEffect(() => {
    if (reduced) return grow.setValue(1);
    // A new post unfurls from its stem once the stalk has grown down to it; the first page just settles in.
    const spring = Animated.spring(grow, { toValue: 1, friction: fresh ? 6 : 7, tension: fresh ? 30 : 50, useNativeDriver: false });
    if (fresh) Animated.sequence([Animated.delay(450), spring]).start();
    else spring.start();
  }, [grow, reduced, fresh]);
  const surface = useMemo(() => leafCardSurface(tokens), [tokens]);
  const mark = tokens.vineStyle !== 'floral' && (tokens.leafShape === 'flower' || tokens.leafShape === 'star') ? <LeafMark shape={tokens.leafShape} leaf={tokens.leaf} accent={tokens.tendril} size={26} /> : undefined;

  return (
    <VineRow from={from} side={side} look={tokens} gap={gap} seed={hashId(card.id)} grow={fresh}>
      <Animated.View
        accessibilityLabel={t(`vine.ripeness.${card.state}`)}
        style={[
          card.state === 'answered' && { ...styles.bloom, shadowColor: colors.gold },
          fresh
            ? {
                opacity: grow,
                transform: [
                  { translateY: grow.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
                  { rotate: grow.interpolate({ inputRange: [0, 1], outputRange: [side === 'left' ? '-14deg' : '14deg', '0deg'] }) },
                  { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                ],
              }
            : { opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
        ]}>
        <LeafFrame side={side} look={tokens} bare mark={mark}>
          <CardSurface.Provider value={surface}>
          <View style={styles.tags}>
            <View style={[styles.ripeness, { backgroundColor: ripeness[card.state], borderColor: tokens.leafSoft }]} />
            {pinned ? <Tr k="feed.pinned" style={[styles.pinned, { color: on(colors.primary) }]} /> : null}
            {card.state === 'answered' ? <Text style={[styles.tag, { color: on(colors.goldText) }]}>{t('vine.bloom')}</Text> : null}
            {card.isMine ? <Text style={[styles.tag, { color: on(BRANCH_TEXT) }]}>{t('vine.yourBranch')}</Text> : null}
            {card.myCommitment ? <Text style={[styles.tag, { color: on(tokens.tendril) }]}>{t('vine.yourTendril')}</Text> : null}
            {card.counts.commitments > 0 ? (
              <Text
                style={[styles.tendrils, { color: on(card.myCommitment ? tokens.tendril : tokens.stem) }]}
                accessibilityLabel={t('vine.tendrils', { count: card.counts.commitments })}>
                {'➰'.repeat(Math.min(card.counts.commitments, MAX_TENDRILS))}
                {card.counts.commitments > MAX_TENDRILS ? ` +${card.counts.commitments - MAX_TENDRILS}` : ''}
              </Text>
            ) : null}
          </View>
          {children}
          </CardSurface.Provider>
        </LeafFrame>
      </Animated.View>
    </VineRow>
  );
}

function ScriptureLeaf({ leaf, tokens, from }: { leaf: Leaf; tokens: VineTokens; from: VineSide | null }) {
  return (
    <VineRow from={from} side="center" look={tokens} gap={VINE_GAP / 2}>
      <View style={[styles.scripture, { backgroundColor: tokens.leafSoft, borderColor: tokens.leaf }]} accessibilityRole="text">
        <Text style={styles.scriptureText}>“{leaf.text}”</Text>
        <Text style={type.small}>
          {leaf.reference}
          {leaf.translation ? ` (${leaf.translation})` : ''}
        </Text>
      </View>
    </VineRow>
  );
}

/**
 * The idle bird: when the screen sits still, a bud labeled "Ad" swells on the
 * vine, a bird flies in, snips it and leaves a speech bubble. Once per visit.
 */
function IdleBird({ tokens, register }: { tokens: VineTokens; register: (nudge: () => void) => void }) {
  const { wording, t } = useLocale();
  // The wait restarts each time the member scrolls. Kept here, not in the feed, so a scroll
  // re-renders only the bird and never the whole list of leaves.
  const [idleKey, setIdleKey] = useState(0);
  useEffect(() => {
    register(() => setIdleKey((k) => k + 1));
  }, [register]);
  const reduced = useReducedMotion();
  const [played, setPlayed] = useState(false);
  const [showing, setShowing] = useState(false);
  const bud = useRef(new Animated.Value(0)).current;
  const bird = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced || played || tokens.idleBirdSeconds <= 0) return;
    const timer = setTimeout(() => {
      setShowing(true);
      setPlayed(true);
      const ease = Easing.inOut(Easing.quad);
      Animated.sequence([
        Animated.timing(bud, { toValue: 1, duration: 1400, easing: ease, useNativeDriver: false }),
        Animated.timing(bird, { toValue: 1, duration: 900, easing: ease, useNativeDriver: false }),
        Animated.parallel([
          Animated.timing(bud, { toValue: 0, duration: 250, useNativeDriver: false }),
          Animated.timing(bubble, { toValue: 1, duration: 250, useNativeDriver: false }),
        ]),
        Animated.delay(2600),
        Animated.parallel([
          Animated.timing(bubble, { toValue: 0, duration: 300, useNativeDriver: false }),
          Animated.timing(bird, { toValue: 2, duration: 900, easing: ease, useNativeDriver: false }),
        ]),
      ]).start(() => setShowing(false));
    }, tokens.idleBirdSeconds * 1000);
    return () => clearTimeout(timer);
    // idleKey changes whenever the member scrolls, restarting the wait.
  }, [idleKey, reduced, played, tokens.idleBirdSeconds, bud, bird, bubble]);

  if (!showing) return null;
  const birdLeft = bird.interpolate({ inputRange: [0, 1, 2], outputRange: ['105%', '52%', '-20%'] });
  return (
    <View style={styles.idle} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.bud, { borderColor: tokens.stem, transform: [{ scale: bud }] }]}>
        <Text style={styles.budText}>Ad</Text>
      </Animated.View>
      <Animated.Text style={[styles.bird, { left: birdLeft }]}>🐦</Animated.Text>
      <Animated.View style={[styles.bubble, { opacity: bubble }]}>
        <Text style={styles.bubbleText}>{wording === 'neutral' ? t('vine.bird') : tokens.birdText}</Text>
      </Animated.View>
    </View>
  );
}

export function VineLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const tokens = useMemo(() => vineTokens(theme), [theme]);
  const [leaves, setLeaves] = useState<Leaf[]>([]);
  const nudgeBird = useRef<() => void>(() => undefined);
  const registerBird = useCallback((nudge: () => void) => {
    nudgeBird.current = nudge;
  }, []);
  const lastScroll = useRef(0);

  // Open Circle members (neutral wording) see no scripture.
  const { wording, t } = useLocale();
  useEffect(() => {
    if (wording === 'neutral') return setLeaves([]);
    api
      .scriptureLeaves()
      .then((r) => setLeaves(r.leaves))
      .catch(() => undefined);
  }, [wording]);

  // A scripture leaf after every few fruit, cycling through the verses.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let line: VineSide | null = null;
    // Moonlit Gate: the feed begins at a drawn gate, and its line of light runs down from the doorway.
    if (tokens.vineStyle === 'gate' && cards.length) out.push({ kind: 'gate', key: 'gate', from: null });
    cards.forEach((card, i) => {
      // Leaves alternate down the vine, so it swoops from side to side; your own requests grow on your branch, on the right.
      const side: VineSide = card.isMine ? 'right' : line === 'left' ? 'right' : 'left';
      out.push({ kind: 'fruit', card, side, gap: VINE_GAP + (hashId(card.id) % 4) * 8, from: line });
      line = side;
      // Its newest comments spread outward and downward on smaller leaves, toward the next (older) request.
      const leafComments = card.leafComments ?? [];
      leafComments.forEach((comment, k) => {
        const s2: VineSide = (k % 2 === 0) === (side === 'left') ? 'right' : 'left';
        out.push({ kind: 'comment', comment, postId: card.id, side: s2, key: `c-${comment.id}`, from: line });
        line = s2;
      });
      if (leafComments.length && card.counts.comments > leafComments.length) {
        const s2: VineSide = line === 'left' ? 'right' : 'left';
        out.push({ kind: 'more', postId: card.id, count: card.counts.comments - leafComments.length, side: s2, key: `more-${card.id}`, from: line });
        line = s2;
      }
      if (leaves.length && tokens.leafEvery > 0 && (i + 1) % tokens.leafEvery === 0) {
        const n = Math.floor(i / tokens.leafEvery);
        out.push({ kind: 'leaf', leaf: leaves[n % leaves.length]!, key: `leaf-${n}`, from: line });
      }
      // Neon Cinderella: a castle, a coach or a slipper after every third request (offset from the verses).
      if (tokens.scenery === 'fairytale' && i % 3 === 1) {
        const n = Math.floor(i / 3);
        out.push({ kind: 'scene', scene: SCENES[n % SCENES.length]!, key: `scene-${n}`, from: line });
      }
    });
    return out;
  }, [cards, leaves, tokens.leafEvery, tokens.scenery, tokens.vineStyle]);

  // Posts that were already here when the feed opened settle in; ones that arrive later grow in.
  const known = useRef<Set<string> | null>(null);
  if (known.current === null && cards.length) known.current = new Set(cards.map((c) => c.id));
  useEffect(() => {
    if (known.current) for (const c of cards) known.current.add(c.id);
  }, [cards]);
  // When a comment or post arrives, the leaves below shuffle down to make room.
  const reduced = useReducedMotion();
  const shown = useRef(items.length);
  useEffect(() => {
    if (items.length !== shown.current && shown.current > 0 && !reduced) LayoutAnimation.configureNext(LayoutAnimation.create(420, LayoutAnimation.Types.spring, LayoutAnimation.Properties.scaleXY));
    shown.current = items.length;
  }, [items.length, reduced]);

  const onScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScroll.current > 1000) {
      lastScroll.current = now;
      nudgeBird.current();
    }
  }, []);

  // A steady renderItem, so a re-render of the feed (the idle bird's timer restarting as the member
  // scrolls) doesn't redraw every visible leaf: FlatList skips cells whose item and renderItem are unchanged.
  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
        item.kind === 'fruit' ? (
          <Fruit card={item.card} pinned={item.card.id === pinnedId} tokens={tokens} side={item.side} from={item.from} gap={item.gap} fresh={!!known.current && !known.current.has(item.card.id)}>
            {/* Its comments hang below as their own leaves, so the card doesn't repeat one. */}
            {renderCard(item.card.leafComments?.length ? { ...item.card, topComment: null } : item.card)}
          </Fruit>
        ) : item.kind === 'comment' ? (
          <VineRow from={item.from} side={item.side} look={tokens} gap={COMMENT_GAP} depth={1} seed={hashId(item.comment.id)}>
            <Pressable
              accessibilityRole="button"
              accessibilityHint={t('vine.openComment')}
              onPress={() => router.push(`/post/${item.postId}?comment=${item.comment.id}`)}>
              <LeafFrame side={item.side} look={tokens} depth={1}>
                <Text style={styles.commentName}>{item.comment.author.displayName}</Text>
                <Text style={styles.commentBody} numberOfLines={3}>
                  {item.comment.body}
                </Text>
              </LeafFrame>
            </Pressable>
          </VineRow>
        ) : item.kind === 'more' ? (
          <VineRow from={item.from} side={item.side} look={tokens} gap={COMMENT_GAP} depth={2} seed={item.count}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/post/${item.postId}`)}>
              {/* The older comments wait behind frosted glass. */}
              <BlurredLeaves look={tokens} depth={1} side={item.side} peek={[]}>
                <Text style={styles.moreText}>{t('vine.moreComments', { count: item.count })}</Text>
              </BlurredLeaves>
            </Pressable>
          </VineRow>
        ) : item.kind === 'gate' ? (
          <GateArch line={tokens.stem} accent={tokens.tendril} testID="gate-arch" />
        ) : item.kind === 'scene' ? (
          <VineRow from={item.from} side="center" look={tokens} gap={VINE_GAP / 2}>
            <NeonScene kind={item.scene} line={tokens.stem} accent={tokens.leaf} />
          </VineRow>
        ) : (
          <ScriptureLeaf leaf={item.leaf} tokens={tokens} from={item.from} />
        ),
    [pinnedId, renderCard, t, tokens],
  );

  return (
    <View style={[styles.fill, tokens.backdrop ? { backgroundColor: tokens.backdrop } : null]}>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'fruit' ? it.card.id : it.key)}
        renderItem={renderItem}
        // On a dark skin the feed's header sits on a light panel so its text stays readable.
        ListHeaderComponent={header ? isDark(tokens.backdrop) ? <View style={styles.headerPanel}>{header}</View> : header : undefined}
        ListFooterComponent={
          atEnd && cards.length > 0 ? (
            <View style={styles.tip}>
              <View style={[styles.tipStem, { backgroundColor: tokens.stem, width: tokens.stemWidth }]} />
              <View style={styles.blossom} />
              <Text style={[styles.end, tokens.backdrop ? { color: textOn(tokens.backdrop) } : null]}>{wording === 'neutral' ? t('vine.tip') : tokens.tipText}</Text>
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
        // Drawn leaves cost more to mount than plain cards, and each comment is its own row:
        // mount two at a time, but further ahead, so no single frame has to draw four.
        maxToRenderPerBatch={2}
        windowSize={9}
        onScroll={onScroll}
        scrollEventThrottle={250}
      />
      {theme?.animations?.idleBird === false ? null : <IdleBird tokens={tokens} register={registerBird} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, paddingBottom: 120 },
  headerPanel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm, marginBottom: space.md },
  ripeness: { width: 14, height: 14, borderRadius: radius.pill, borderWidth: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  tag: { fontSize: 13, fontWeight: '700' },
  tendrils: { fontSize: 14, letterSpacing: -2 },
  // An answered request blooms: a soft gold glow around the fruit.
  bloom: { borderRadius: radius.lg, borderWidth: 2, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  pinned: { ...type.small, color: colors.primary, fontWeight: '700' },
  scripture: { alignSelf: 'center', width: '70%', marginVertical: space.lg, padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  scriptureText: { fontSize: 15, lineHeight: 21, fontStyle: 'italic', fontFamily: 'serif', color: colors.text },
  commentName: { fontSize: 13, fontWeight: '700', color: COMMENT_TEXT },
  commentBody: { fontSize: 14, lineHeight: 19, color: COMMENT_TEXT },
  // On its own light pill, so it reads over the frosted leaves on any skin.
  moreText: { ...type.small, color: colors.text, fontWeight: '700', backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs, overflow: 'hidden' },
  tip: { alignItems: 'center', gap: space.sm },
  tipStem: { width: 4, height: 40, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  blossom: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.gold, borderWidth: 4, borderColor: colors.goldSoft },
  end: { ...type.small, textAlign: 'center', paddingHorizontal: space.xl },
  idle: { position: 'absolute', left: 0, right: 0, bottom: 110, height: 120 },
  bud: {
    position: 'absolute',
    left: '50%',
    marginLeft: -22,
    top: 50,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    backgroundColor: '#F4D9E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  budText: { fontSize: 12, fontWeight: '800', color: '#9A3B62' },
  bird: { position: 'absolute', top: 30, fontSize: 34 },
  bubble: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  bubbleText: { ...type.small, color: colors.text, textAlign: 'center', fontWeight: '700' },
});
