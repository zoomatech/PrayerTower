// Vine (beta): requests hang from one growing stem, alternating sides, and
// blossom in as they arrive. Ripeness follows the request's state. The stem is
// the scroll-progress indicator; the end of the feed is a resting vine tip.
import type { Card, PostState } from '@prayer-tower/shared';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, FlatList, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { vinePlacement } from './placement';

const vine = { stem: '#6E8B4E', leaf: '#A9C08A', leafSoft: '#EEF3E6' };
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

function Fruit({ card, pinned, children }: { card: Card; pinned: boolean; children: React.ReactNode }) {
  const { side, tilt, gap } = vinePlacement(card.id);
  const reduced = useReducedMotion();
  const grow = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return grow.setValue(1);
    Animated.spring(grow, { toValue: 1, friction: 7, tension: 50, useNativeDriver: false }).start();
  }, [grow, reduced]);
  const left = side === 'left';

  return (
    <View style={[styles.row, { paddingTop: gap }]}>
      <View style={styles.stem} />
      <Animated.View
        style={[
          styles.fruit,
          left ? styles.fruitLeft : styles.fruitRight,
          { opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
        ]}>
        <View style={[styles.leaf, left ? { right: -10 } : { left: -10 }, { transform: [{ rotate: `${left ? tilt : -tilt}deg` }] }]} />
        <View style={[styles.ripeness, { backgroundColor: ripeness[card.state] }, left ? { right: -7 } : { left: -7 }]} />
        {pinned ? <Text style={styles.pinned}>Pray for this first</Text> : null}
        {children}
      </Animated.View>
    </View>
  );
}

export function VineLayout({ cards, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  return (
    <FlatList
      data={cards}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <Fruit card={item} pinned={item.id === pinnedId}>
          {renderCard(item)}
        </Fruit>
      )}
      ListHeaderComponent={header ?? undefined}
      ListFooterComponent={
        atEnd && cards.length > 0 ? (
          <View style={styles.tip}>
            <View style={styles.tipStem} />
            <View style={styles.blossom} />
            <Text style={styles.end}>You have reached the tip of the vine. Thank you for praying.</Text>
          </View>
        ) : undefined
      }
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  row: { position: 'relative' },
  // The stem runs down the middle of every row, so together the rows form one vine.
  stem: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 4, marginLeft: -2, backgroundColor: vine.stem, borderRadius: 2 },
  fruit: { width: '86%', position: 'relative' },
  fruitLeft: { alignSelf: 'flex-start' },
  fruitRight: { alignSelf: 'flex-end' },
  leaf: {
    position: 'absolute',
    top: 18,
    width: 34,
    height: 18,
    borderTopLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: vine.leaf,
  },
  ripeness: { position: 'absolute', top: 42, width: 14, height: 14, borderRadius: radius.pill, borderWidth: 2, borderColor: vine.leafSoft },
  pinned: { ...type.small, color: colors.primary, fontWeight: '700', marginBottom: space.xs },
  tip: { alignItems: 'center', paddingTop: 0, gap: space.sm },
  tipStem: { width: 4, height: 40, backgroundColor: vine.stem, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  blossom: { width: 22, height: 22, borderRadius: radius.pill, backgroundColor: colors.gold, borderWidth: 4, borderColor: colors.goldSoft },
  end: { ...type.small, textAlign: 'center', paddingHorizontal: space.xl },
});
