// Swipe to pray (beta carousel): one request at a time, like a card deck.
// Swipe right (or tap Pray) to open Praying Now; swipe left (or tap Next) to
// move on. A swipe never records a prayer by itself: Praying Now still asks
// the member to confirm, so every prayer stays deliberate.
import type { Card } from '@prayer-tower/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui';
import { Tr } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';

/** How far (as a share of the screen width) a swipe must travel to count. */
const SWIPE_THRESHOLD = 0.28;

export function CarouselLayout({ cards, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd, onAction }: FeedLayoutProps) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const card: Card | undefined = cards[index];

  // Fetch the next page before the deck runs out.
  useEffect(() => {
    if (index >= cards.length - 3 && !atEnd) onEndReached();
  }, [index, cards.length, atEnd, onEndReached]);

  // A refresh starts the deck over.
  useEffect(() => {
    if (refreshing) setIndex(0);
  }, [refreshing]);

  const advance = (direction: 1 | -1, pray: boolean) => {
    const current = cards[index];
    Animated.timing(x, { toValue: direction * width * 1.2, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      x.setValue(0);
      setIndex((i) => i + 1);
      if (pray && current && onAction) onAction(current, 'praying_now');
    });
  };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(g.dx),
      // Keep the gesture once it is a horizontal swipe, even inside the scroll view.
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_, g) => settle(g.dx),
      onPanResponderTerminate: (_, g) => settle(g.dx),
    }),
  ).current;
  function settle(dx: number) {
    if (dx > width * SWIPE_THRESHOLD) advanceRef.current(1, true);
    else if (dx < -width * SWIPE_THRESHOLD) advanceRef.current(-1, false);
    else Animated.spring(x, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start();
  }
  // The responder is created once; keep it pointed at the latest advance().
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const rotate = x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-12deg', '0deg', '12deg'] });
  const prayHint = x.interpolate({ inputRange: [0, width * SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const skipHint = x.interpolate({ inputRange: [-width * SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {header}
      {card ? (
        <>
          {card.id === pinnedId ? <Tr k="feed.pinned" style={styles.pinned} /> : null}
          <View>
            <Animated.View style={[styles.hint, styles.hintPray, { opacity: prayHint }]} pointerEvents="none">
              <Text style={styles.hintText}>Pray 💜</Text>
            </Animated.View>
            <Animated.View style={[styles.hint, styles.hintSkip, { opacity: skipHint }]} pointerEvents="none">
              <Text style={styles.hintText}>Next</Text>
            </Animated.View>
            <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }, { rotate }] }}>
              {renderCard(card)}
            </Animated.View>
          </View>
          <View style={styles.row}>
            <Button variant="secondary" label="‹ Next" onPress={() => advance(-1, false)} />
            <Button label="Pray ›" onPress={() => advance(1, true)} />
          </View>
          <Text style={styles.folio}>
            {index + 1} of {cards.length}
            {index === 0 ? ' · Swipe right to pray, left to move on' : ''}
          </Text>
        </>
      ) : atEnd || cards.length === 0 ? (
        <View style={styles.end}>
          <Text style={type.heading}>You have seen every request for now</Text>
          <Text style={styles.folioText}>Thank you for praying.</Text>
          <Button variant="secondary" label="Start again" onPress={() => (setIndex(0), onRefresh())} />
        </View>
      ) : (
        <Text style={styles.folioText}>Loading more requests…</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 100 },
  pinned: { ...type.small, color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  folio: { ...type.small, textAlign: 'center', fontVariant: ['tabular-nums'] },
  folioText: { ...type.small, textAlign: 'center' },
  end: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  hint: { position: 'absolute', top: space.lg, zIndex: 2, paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: 8, borderWidth: 2 },
  hintPray: { left: space.lg, borderColor: colors.primary, transform: [{ rotate: '-10deg' }] },
  hintSkip: { right: space.lg, borderColor: colors.textMuted, transform: [{ rotate: '10deg' }] },
  hintText: { fontWeight: '800', fontSize: 18, color: colors.primary },
});
