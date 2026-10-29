// Vine 2.0: the community is one plant. Requests hang from a single
// stem as fruit, alternating sides; ripeness follows the request's state.
// Your own requests grow on your branch (and all of them on the Your branch
// screen), a tendril curls toward each request for every promise to pray (yours
// in the tendril color), answered requests bloom, and scripture leaves ("abide in the vine") sit
// between the fruit. The stem is the scroll indicator, the feed ends at a
// resting vine tip, and if the screen sits idle a bird snips off a would-be
// ad bud. Colors, spacing and copy come from the theme's tokens, so the look
// can change without an app release. Reduced motion turns the animations off.
// Skins (Beanstalk, Golden Wood, Moonlit Gate) are the same vine with other
// tokens: a backdrop, a thicker or doubled stem and round or pointed leaves.
import type { Card, FeedTheme, PostState } from '@prayer-tower/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { Tr, useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';
import { vinePlacement } from './placement';

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
  leafShape: 'round' as 'round' | 'pointed',
};
type VineTokens = typeof DEFAULTS;

/** Theme tokens override the defaults key by key; wrong types are ignored. */
export function vineTokens(theme: FeedTheme | null): VineTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof t[k] === typeof v) out[k] = t[k];
  out.stemWidth = Math.min(Math.max(Number(out.stemWidth) || DEFAULTS.stemWidth, 2), 14);
  if (out.leafShape !== 'pointed') out.leafShape = 'round';
  return out as VineTokens;
}

/** The stem through one row; every row draws its piece, so together they form one plant. */
export function Stem({ tokens }: { tokens: VineTokens }) {
  const w = tokens.stemWidth;
  if (tokens.stemDouble)
    return <View style={[styles.stem, { width: w * 3, marginLeft: -(w * 3) / 2, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: tokens.stem, borderRadius: 0 }]} />;
  return <View style={[styles.stem, { backgroundColor: tokens.stem, width: w, marginLeft: -w / 2, borderRadius: w / 2 }]} />;
}

const POINTED = { borderTopLeftRadius: 2, borderBottomRightRadius: 2, borderTopRightRadius: 18, borderBottomLeftRadius: 18 };

const ripeness: Record<PostState, string> = {
  open: '#9BC59D',
  actively_prayed: '#E6C35C',
  amplified: '#E8964A',
  answered: colors.gold,
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

interface Leaf {
  id: string;
  reference: string;
  text: string;
  translation: string | null;
}

type Item = { kind: 'fruit'; card: Card } | { kind: 'leaf'; leaf: Leaf; key: string };

/** How many tendrils a fruit shows at most; the label carries the real count. */
const MAX_TENDRILS = 5;

function Fruit({ card, pinned, tokens, children }: { card: Card; pinned: boolean; tokens: VineTokens; children: React.ReactNode }) {
  const { t } = useLocale();
  const { side: hashedSide, tilt, gap } = vinePlacement(card.id);
  // Your own requests always grow on your branch, on the right.
  const side = card.isMine ? 'right' : hashedSide;
  const left = side === 'left';
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return grow.setValue(1);
    Animated.spring(grow, { toValue: 1, friction: 7, tension: 50, useNativeDriver: false }).start();
  }, [grow, reduced]);

  return (
    <View style={[styles.row, { paddingTop: gap }]} accessibilityLabel={t(`vine.ripeness.${card.state}`)}>
      <Stem tokens={tokens} />
      {card.isMine ? <View style={[styles.branch, { backgroundColor: tokens.branch }]} /> : null}
      <Animated.View
        style={[
          styles.fruit,
          left ? styles.fruitLeft : styles.fruitRight,
          card.state === 'answered' && { ...styles.bloom, shadowColor: colors.gold, borderColor: colors.goldSoft },
          { opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
        ]}>
        <View
          style={[
            styles.leaf,
            tokens.leafShape === 'pointed' && POINTED,
            { backgroundColor: tokens.leaf },
            left ? { right: -10 } : { left: -10 },
            { transform: [{ rotate: `${left ? tilt : -tilt}deg` }] },
          ]}
        />
        <View style={[styles.ripeness, { backgroundColor: ripeness[card.state], borderColor: tokens.leafSoft }, left ? { right: -7 } : { left: -7 }]} />
        <View style={styles.tags}>
          {pinned ? <Tr k="feed.pinned" style={styles.pinned} /> : null}
          {card.state === 'answered' ? <Text style={[styles.tag, { color: colors.goldText }]}>{t('vine.bloom')}</Text> : null}
          {card.isMine ? <Text style={[styles.tag, { color: BRANCH_TEXT }]}>{t('vine.yourBranch')}</Text> : null}
          {card.myCommitment ? <Text style={[styles.tag, { color: tokens.tendril }]}>{t('vine.yourTendril')}</Text> : null}
        </View>
        {card.counts.commitments > 0 ? (
          <Text
            style={[styles.tendrils, { color: card.myCommitment ? tokens.tendril : tokens.stem }]}
            accessibilityLabel={t('vine.tendrils', { count: card.counts.commitments })}>
            {'➰'.repeat(Math.min(card.counts.commitments, MAX_TENDRILS))}
            {card.counts.commitments > MAX_TENDRILS ? ` +${card.counts.commitments - MAX_TENDRILS}` : ''}
          </Text>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

function ScriptureLeaf({ leaf, tokens }: { leaf: Leaf; tokens: VineTokens }) {
  return (
    <View style={styles.row}>
      <Stem tokens={tokens} />
      <View style={[styles.scripture, { backgroundColor: tokens.leafSoft, borderColor: tokens.leaf }]} accessibilityRole="text">
        <Text style={styles.scriptureText}>“{leaf.text}”</Text>
        <Text style={type.small}>
          {leaf.reference}
          {leaf.translation ? ` (${leaf.translation})` : ''}
        </Text>
      </View>
    </View>
  );
}

/**
 * The idle bird: when the screen sits still, a bud labeled "Ad" swells on the
 * vine, a bird flies in, snips it and leaves a speech bubble. Once per visit.
 */
function IdleBird({ tokens, idleKey }: { tokens: VineTokens; idleKey: number }) {
  const { wording, t } = useLocale();
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
  const [idleKey, setIdleKey] = useState(0);
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
    cards.forEach((card, i) => {
      out.push({ kind: 'fruit', card });
      if (leaves.length && tokens.leafEvery > 0 && (i + 1) % tokens.leafEvery === 0) {
        const n = Math.floor(i / tokens.leafEvery);
        out.push({ kind: 'leaf', leaf: leaves[n % leaves.length]!, key: `leaf-${n}` });
      }
    });
    return out;
  }, [cards, leaves, tokens.leafEvery]);

  const onScroll = useCallback(() => {
    const now = Date.now();
    if (now - lastScroll.current > 1000) {
      lastScroll.current = now;
      setIdleKey((k) => k + 1);
    }
  }, []);

  return (
    <View style={[styles.fill, tokens.backdrop ? { backgroundColor: tokens.backdrop } : null]}>
      <FlatList
        data={items}
        keyExtractor={(it) => (it.kind === 'fruit' ? it.card.id : it.key)}
        renderItem={({ item }) =>
          item.kind === 'fruit' ? (
            <Fruit card={item.card} pinned={item.card.id === pinnedId} tokens={tokens}>
              {renderCard(item.card)}
            </Fruit>
          ) : (
            <ScriptureLeaf leaf={item.leaf} tokens={tokens} />
          )
        }
        ListHeaderComponent={header ?? undefined}
        ListFooterComponent={
          atEnd && cards.length > 0 ? (
            <View style={styles.tip}>
              <View style={[styles.tipStem, { backgroundColor: tokens.stem, width: tokens.stemWidth }]} />
              <View style={styles.blossom} />
              <Text style={styles.end}>{wording === 'neutral' ? t('vine.tip') : tokens.tipText}</Text>
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
        onScroll={onScroll}
        scrollEventThrottle={250}
      />
      {theme?.animations?.idleBird === false ? null : <IdleBird tokens={tokens} idleKey={idleKey} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, paddingBottom: 120 },
  row: { position: 'relative' },
  // The stem runs down the middle of every row, so together the rows form one vine.
  stem: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 4, marginLeft: -2, borderRadius: 2 },
  // Your branch: a short woody limb from the stem toward your request.
  branch: { position: 'absolute', left: '50%', width: '18%', top: 36, height: 5, borderRadius: 3, transform: [{ rotate: '-12deg' }] },
  fruit: { width: '86%', position: 'relative' },
  fruitLeft: { alignSelf: 'flex-start' },
  fruitRight: { alignSelf: 'flex-end' },
  leaf: { position: 'absolute', top: 18, width: 34, height: 18, borderTopLeftRadius: 18, borderBottomRightRadius: 18 },
  ripeness: { position: 'absolute', top: 42, width: 14, height: 14, borderRadius: radius.pill, borderWidth: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.xs },
  tag: { fontSize: 13, fontWeight: '700' },
  tendrils: { fontSize: 14, letterSpacing: -2, marginBottom: space.xs },
  // An answered request blooms: a soft gold glow around the fruit.
  bloom: { borderRadius: radius.lg, borderWidth: 2, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  pinned: { ...type.small, color: colors.primary, fontWeight: '700' },
  scripture: { alignSelf: 'center', width: '70%', marginVertical: space.lg, padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  scriptureText: { fontSize: 15, lineHeight: 21, fontStyle: 'italic', fontFamily: 'serif', color: colors.text },
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
