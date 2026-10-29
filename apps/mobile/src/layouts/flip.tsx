// Flip (beta): one request per page. Swiping turns the page with a
// Flipboard-style fold, so each request gets the whole screen and the reader
// prays through them one at a time.
import type { Card } from '@prayer-tower/shared';
import { useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { Tr } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';

type Page = { kind: 'card'; card: Card } | { kind: 'end' };

export function FlipLayout({ cards, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const [height, setHeight] = useState(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const pages: Page[] = [
    ...cards.map((card) => ({ kind: 'card' as const, card })),
    ...(atEnd && cards.length > 0 ? [{ kind: 'end' as const }] : []),
  ];

  const renderPage = ({ item, index }: { item: Page; index: number }) => {
    const range = [(index - 1) * height, index * height, (index + 1) * height];
    // Reduce Motion: pages still snap, but don't tilt, shrink or fade as they turn.
    const turn = reduced
      ? null
      : {
      opacity: scrollY.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' }),
      transform: [
        { perspective: 1200 },
        { rotateX: scrollY.interpolate({ inputRange: range, outputRange: ['55deg', '0deg', '-55deg'], extrapolate: 'clamp' }) },
        { scale: scrollY.interpolate({ inputRange: range, outputRange: [0.9, 1, 0.9], extrapolate: 'clamp' }) },
      ],
    };
    return (
      <Animated.View style={[styles.page, { height }, turn]}>
        {item.kind === 'card' ? (
          <View style={styles.inner}>
            {index === 0 ? header : null}
            {item.card.id === pinnedId ? <Tr k="feed.pinned" style={styles.pinned} /> : null}
            {renderCard(item.card)}
            <Text style={styles.folio}>
              {index + 1} of {cards.length}
              {index === 0 ? ' · Swipe up to turn the page' : ''}
            </Text>
          </View>
        ) : (
          <View style={[styles.inner, { alignItems: 'center' }]}>
            <Tr k="layout.lastPage" style={type.heading} />
            <Tr k="layout.allSeen" style={styles.hint} />
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.root} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 ? (
        <Animated.FlatList
          data={pages}
          keyExtractor={(p, i) => (p.kind === 'card' ? p.card.id : `${p.kind}-${i}`)}
          renderItem={renderPage}
          pagingEnabled
          // One page fills the screen: keep the pages either side ready, no more.
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: Platform.OS !== 'web',
          })}
          scrollEventThrottle={16}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          onEndReachedThreshold={1}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { justifyContent: 'center', backfaceVisibility: 'hidden' },
  inner: { paddingHorizontal: space.lg, paddingBottom: 80, gap: space.md },
  pinned: { ...type.small, color: colors.primary, fontWeight: '700' },
  hint: { ...type.small, textAlign: 'center' },
  folio: { ...type.small, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
