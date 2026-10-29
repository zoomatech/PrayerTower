// Prayer Tower (beta, behind Admin → Feed skins): the feed is a stone tower and
// each request is one floor. A little climber on the tower's edge goes up a
// floor every time the member moves on to the next request (Steve, 2026-10-29).
// Works on phones and tablets; on wide screens the tower stays a readable width.
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
import type { Card, FeedTheme } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { Tr, useLocale } from '@/lib/i18n';
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

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

const BRICK = 22;

/** One edge of the tower: stacked stones with offset joints, scrolled by `shift`. */
function Pillar({ tokens, shift, side }: { tokens: TowerTokens; shift: Animated.Value; side: 'left' | 'right' }) {
  const rows = 60;
  return (
    <View style={[styles.pillar, side === 'left' ? { left: 0 } : { right: 0 }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ translateY: Animated.modulo(shift, BRICK * 2) }], marginTop: -BRICK * 2 }}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={[styles.brickRow, { borderColor: tokens.mortar }]}>
            <View style={[styles.brick, { backgroundColor: tokens.stone, borderColor: tokens.mortar, flex: i % 2 ? 1 : 2 }]} />
            <View style={[styles.brick, { backgroundColor: tokens.stone, borderColor: tokens.mortar, flex: i % 2 ? 2 : 1 }]} />
          </View>
        ))}
      </Animated.View>
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
  useEffect(() => {
    if (!atEnd && index >= floors.length - 2) onEndReached();
  }, [index, floors.length, atEnd, onEndReached]);

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
        <Animated.Text
          style={[styles.climber, { transform: [{ translateY: bob }] }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="tower-climber">
          {tokens.climber}
        </Animated.Text>
        <Animated.View style={[styles.floor, { opacity: enter.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: enter.interpolate({ inputRange: [-1, 0, 1], outputRange: [-60, 0, 60] }) }] }]}>
          <ScrollView key={index} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={styles.floorContent}>
            {current?.kind === 'header' ? (
              <View style={styles.panel}>{header}</View>
            ) : current?.kind === 'card' ? (
              <>
                {current.card.id === pinnedId ? <Tr k="feed.pinned" style={styles.label} /> : null}
                <View style={styles.card}>{renderCard(current.card)}</View>
              </>
            ) : current?.kind === 'top' ? (
              <View style={[styles.panel, { alignItems: 'center', gap: space.sm }]}>
                <Text style={styles.flag} accessibilityElementsHidden>
                  🚩
                </Text>
                <Text style={type.heading}>{t('tower.top')}</Text>
                <Button small variant="ghost" label={t('vine.growMore')} onPress={onRefresh} busy={refreshing} />
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
  pillar: { position: 'absolute', top: 0, bottom: 0, width: 18, overflow: 'hidden' },
  brickRow: { height: BRICK, flexDirection: 'row' },
  brick: { borderWidth: 1, borderRadius: 2 },
  climber: { position: 'absolute', right: -2, top: '45%', fontSize: 30, zIndex: 2 },
  floor: { flex: 1, marginHorizontal: 22 },
  floorContent: { paddingVertical: space.md, gap: space.sm, flexGrow: 1, justifyContent: 'center' },
  panel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm },
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  flag: { fontSize: 36 },
  controls: { width: '100%', maxWidth: 680, paddingHorizontal: space.md, paddingTop: space.xs, paddingBottom: 76, gap: space.xs, alignItems: 'center' },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  label: { ...type.small, color: colors.text, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
