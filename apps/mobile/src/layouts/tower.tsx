// Prayer Tower (beta, behind Admin → Feed skins): the feed is a stone tower and
// each request is one floor. A little climber on the tower's edge goes up a
// floor every time the member moves on to the next request (Steve, 2026-10-29).
// Works on phones and tablets; on wide screens the tower stays a readable width.
// Drawn (components/stone-tablet.tsx): walls of dressed stone, a climber on a
// rope, battlements at the top, each request carved on a stone tablet and its
// newest comments on smaller sub-tablets hung below it.
//
// Which swipe climbs is the member's choice, kept on the device:
//   * "down" (default): pull the tower down to climb. The content follows the
//     finger, as on every touch screen, and the climber still goes up. Studies of
//     scrolling find people respond fastest when the content moves the way
//     their hand does (Human Factors, "Response-effect compatibility defines the
//     natural scrolling direction").
//   * "up": push up to climb, the way the climber moves. Steve wanted to see
//     whether people adapt to it.
// A floor taller than the screen scrolls inside itself first; the climb happens
// at its top or bottom edge. "Climb" buttons do the same for anyone who prefers
// not to swipe (and for screen readers). Reduced motion turns the movement off.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COMMENT_TEXT, type Card, type FeedTheme } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { CardSurface } from '@/components/post-card';
import { Battlements, Climber, StoneTablet, StoneWall, tabletCardSurface } from '@/components/stone-tablet';
import { Button, Chip } from '@/components/ui';
import { Tr, useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { useFeedHooks, useNearEnd } from '@/skins/feed-hooks';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { vineTokens } from './vine';

export type ClimbDirection = 'down' | 'up';
const DIRECTION_KEY = 'prayer-tower.tower.climb-direction';

const DEFAULTS = { stone: '#B9AE9C', mortar: '#8F8574', backdrop: '#EAF2F8', climber: '🧗' };
type TowerTokens = typeof DEFAULTS;

export function towerTokens(theme: FeedTheme | null): TowerTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, string>;
  for (const k of Object.keys(DEFAULTS)) if (typeof t[k] === 'string' && t[k]) out[k] = t[k] as string;
  return out as TowerTokens;
}

/** Comment trees on the tower: stone tablets with mortar lines instead of leaves on branches. */
export function tabletTokens(theme: FeedTheme | null) {
  const t = towerTokens(theme);
  return vineTokens({ slug: 'tablets', name: 'tablets', layout: 'vine', cardTemplates: {}, animations: {}, tokens: { stem: t.mortar, branch: t.mortar, leaf: t.stone, leafSoft: '#F6F3EE', leafShape: 'tablet' } });
}

/** Whether a vertical swipe of `dy` climbs (+1), goes back down (-1) or neither (0). */
export function climbStep(dy: number, direction: ClimbDirection, edge: { top: boolean; bottom: boolean }): -1 | 0 | 1 {
  if (Math.abs(dy) < 40) return 0;
  const pullDown = dy > 0;
  // Pulling down needs the floor scrolled to its top; pushing up needs its bottom.
  if (pullDown && !edge.top) return 0;
  if (!pullDown && !edge.bottom) return 0;
  const climbs = direction === 'down' ? pullDown : !pullDown;
  return climbs ? 1 : -1;
}


const BRICK = 22;
const WALL = 28;

/** One edge of the tower: a drawn wall of dressed stone, scrolled by `shift`. */
function Pillar({ tokens, shift, side }: { tokens: TowerTokens; shift: Animated.Value; side: 'left' | 'right' }) {
  return (
    <View style={[styles.pillar, side === 'left' ? { left: 0 } : { right: 0 }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ transform: [{ translateY: Animated.modulo(shift, BRICK * 4) }], marginTop: -BRICK * 4 }}>
        <StoneWall width={WALL} rows={64} course={BRICK} stone={tokens.stone} mortar={tokens.mortar} />
      </Animated.View>
    </View>
  );
}

/** A request carved on a stone tablet, with its newest comments on smaller sub-tablets below it. */
function TabletFloor({ card, tokens, renderCard }: { card: Card; tokens: TowerTokens; renderCard: FeedLayoutProps['renderCard'] }) {
  const { openPost } = useFeedHooks();
  const { t } = useLocale();
  const surface = useMemo(() => tabletCardSurface(tokens.stone), [tokens.stone]);
  const comments = card.leafComments ?? [];
  return (
    <View style={styles.floorStack}>
      <StoneTablet stone={tokens.stone} mortar={tokens.mortar} seed={card.id.charCodeAt(0) + card.id.charCodeAt(1)} testID="tower-tablet">
        <CardSurface.Provider value={surface}>{renderCard(comments.length ? { ...card, topComment: null } : card)}</CardSurface.Provider>
      </StoneTablet>
      {comments.map((c, k) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityHint={t('vine.openComment')}
          onPress={() => openPost(card.id, c.id)}
          style={[styles.sub, { marginLeft: 18 + (k % 2) * 22, marginRight: 18 + ((k + 1) % 2) * 22 }]}>
          {/* A short iron chain hangs each sub-tablet from the one above. */}
          <View style={[styles.chain, { borderColor: tokens.mortar }]} />
          <StoneTablet stone={tokens.stone} mortar={tokens.mortar} depth={1} seed={c.id.charCodeAt(0) + k}>
            <Text style={styles.commentName}>{c.author.displayName}</Text>
            <Text style={styles.commentBody} numberOfLines={3}>
              {c.body}
            </Text>
          </StoneTablet>
        </Pressable>
      ))}
      {comments.length && card.counts.comments > comments.length ? (
        <Button small variant="ghost" label={t('vine.moreComments', { count: card.counts.comments - comments.length })} onPress={() => openPost(card.id)} />
      ) : null}
    </View>
  );
}

type Floor = { kind: 'header' } | { kind: 'card'; card: Card } | { kind: 'top' };

export function TowerLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => towerTokens(theme), [theme]);
  const reduced = useReducedMotion();
  const [direction, setDirection] = useState<ClimbDirection>('down');
  const [index, setIndex] = useState(0);
  const [topWidth, setTopWidth] = useState(0);
  const edge = useRef({ top: true, bottom: true });
  const shift = useRef(new Animated.Value(0)).current;
  const shiftTo = useRef(0);
  const bob = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(DIRECTION_KEY)
      .then((v) => (v === 'up' || v === 'down') && setDirection(v))
      .catch(() => undefined);
  }, []);
  const chooseDirection = (d: ClimbDirection) => {
    setDirection(d);
    AsyncStorage.setItem(DIRECTION_KEY, d).catch(() => undefined);
  };

  const floors: Floor[] = useMemo(
    () => [...(header ? [{ kind: 'header' as const }] : []), ...cards.map((card) => ({ kind: 'card' as const, card })), ...(atEnd && cards.length > 0 ? [{ kind: 'top' as const }] : [])],
    [header, cards, atEnd],
  );
  const first = header ? 1 : 0;
  const current = floors[Math.min(index, floors.length - 1)];

  // Ask for more requests two floors before running out.
  useNearEnd(index, floors.length, atEnd, onEndReached, 2);

  const go = (step: -1 | 1) => {
    const next = Math.max(0, Math.min(floors.length - 1, index + step));
    if (next === index) return;
    edge.current = { top: true, bottom: true };
    setIndex(next);
    if (reduced) return;
    // The tower slides down past the climber as they go up (and back up as they go down).
    shiftTo.current += step * BRICK * 4;
    Animated.parallel([
      Animated.timing(shift, { toValue: shiftTo.current, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(bob, { toValue: -step * 14, duration: 200, useNativeDriver: true }),
        Animated.spring(bob, { toValue: 0, friction: 4, useNativeDriver: true }),
      ]),
    ]).start();
    enter.setValue(-step);
    Animated.timing(enter, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const goRef = useRef(go);
  goRef.current = go;
  const directionRef = useRef(direction);
  directionRef.current = direction;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          Math.abs(g.dy) > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5 && climbStep(g.dy * 4, directionRef.current, edge.current) !== 0,
        onPanResponderRelease: (_, g) => {
          const step = climbStep(g.dy, directionRef.current, edge.current);
          if (step) goRef.current(step);
        },
      }),
    [],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    edge.current = { top: contentOffset.y <= 2, bottom: contentOffset.y + layoutMeasurement.height >= contentSize.height - 2 };
  };

  const floorNumber = index - first + 1;
  return (
    <View style={[styles.root, { backgroundColor: tokens.backdrop }]} {...pan.panHandlers} testID="tower-layout">
      <View style={styles.tower}>
        <Pillar tokens={tokens} shift={shift} side="left" />
        <Pillar tokens={tokens} shift={shift} side="right" />
        {/* The climber hangs on the right-hand edge, halfway up the screen. */}
        {/* A skin may set its own climber (an emoji); otherwise the drawn climber on a rope. */}
        {tokens.climber && tokens.climber !== DEFAULTS.climber ? (
          <Animated.Text
            style={[styles.climber, { transform: [{ translateY: bob }] }]}
            maxFontSizeMultiplier={1.3}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="tower-climber">
            {tokens.climber}
          </Animated.Text>
        ) : (
          <>
            <View style={styles.rope} pointerEvents="none" />
            <Animated.View style={[styles.drawnClimber, { transform: [{ translateY: bob }] }]} pointerEvents="none" testID="tower-climber">
              <Climber height={84} />
            </Animated.View>
          </>
        )}
        <Animated.View style={[styles.floor, { opacity: enter.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: enter.interpolate({ inputRange: [-1, 0, 1], outputRange: [-60, 0, 60] }) }] }]}>
          <ScrollView key={index} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={styles.floorContent}>
            {current?.kind === 'header' ? (
              <View style={styles.panel}>{header}</View>
            ) : current?.kind === 'card' ? (
              <>
                {current.card.id === pinnedId ? <Tr k="feed.pinned" style={styles.label} /> : null}
                <TabletFloor card={current.card} tokens={tokens} renderCard={renderCard} />
              </>
            ) : current?.kind === 'top' ? (
              <View style={{ gap: 0 }} onLayout={(e) => setTopWidth(e.nativeEvent.layout.width)}>
              {topWidth ? <Battlements width={topWidth} stone={tokens.stone} mortar={tokens.mortar} /> : null}
              <View style={[styles.panel, styles.topPanel, { alignItems: 'center', gap: space.sm }]}>
                <Text style={styles.flag} accessibilityElementsHidden>
                  🚩
                </Text>
                <Text style={type.heading}>{t('tower.top')}</Text>
                <Button small variant="ghost" label={t('vine.growMore')} onPress={onRefresh} busy={refreshing} />
              </View>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
      <View style={styles.controls}>
        <Text style={styles.label}>
          {current?.kind === 'card' ? t('tower.floor', { n: floorNumber, total: cards.length }) : current?.kind === 'header' ? t('tower.base') : ''}
        </Text>
        <View style={styles.row}>
          <Button small variant="secondary" label={t('tower.climbDown')} onPress={() => go(-1)} disabled={index === 0} />
          <Button small label={t('tower.climbUp')} onPress={() => go(1)} disabled={index >= floors.length - 1} />
        </View>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('tower.directionLabel')}>
          <Chip radio label={t('tower.pullDown')} selected={direction === 'down'} onPress={() => chooseDirection('down')} />
          <Chip radio label={t('tower.pushUp')} selected={direction === 'up'} onPress={() => chooseDirection('up')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  // A readable width on tablets; the full width on phones.
  tower: { flex: 1, width: '100%', maxWidth: 680, overflow: 'hidden' },
  pillar: { position: 'absolute', top: 0, bottom: 0, width: WALL, overflow: 'hidden' },
  climber: { position: 'absolute', right: -2, top: '45%', fontSize: 30, zIndex: 2 },
  // The rope hangs from the top of the screen to the climber's hands; the drawing carries it on below.
  rope: { position: 'absolute', top: 0, height: '46%', right: 20, width: 2, backgroundColor: '#8A6A3D', zIndex: 2 },
  drawnClimber: { position: 'absolute', right: -3, top: '44%', zIndex: 2 },
  floor: { flex: 1, marginHorizontal: WALL + 6 },
  floorStack: { gap: 0 },
  sub: { marginTop: 4 },
  chain: { alignSelf: 'center', width: 8, height: 14, borderWidth: 2, borderRadius: 4, marginBottom: -2 },
  commentName: { fontSize: 13, fontWeight: '700', color: COMMENT_TEXT },
  commentBody: { fontSize: 14, lineHeight: 19, color: COMMENT_TEXT },
  topPanel: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  floorContent: { paddingVertical: space.md, gap: space.sm, flexGrow: 1, justifyContent: 'center' },
  panel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm },
  flag: { fontSize: 36 },
  controls: { width: '100%', maxWidth: 680, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: 76, gap: space.xs, alignItems: 'center' },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  label: { ...type.small, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
