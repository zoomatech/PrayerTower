// Wall (beta, behind Admin → Feed skins): a solid wall of full-screen posts, one
// per swipe, like a short-video app. No fold or tilt, just a hard snap, on a
// dark backdrop from the theme's tokens. Same cards and action row as every layout.
import type { Card, FeedTheme } from '@prayer-tower/shared';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Tr, useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';

type Page = { kind: 'card'; card: Card } | { kind: 'end' };

export function wallBackdrop(theme: FeedTheme | null): string {
  const b = (theme?.tokens as Record<string, unknown> | undefined)?.backdrop;
  return typeof b === 'string' && /^#[0-9A-Fa-f]{6}$/.test(b) ? b : '#101418';
}

export function WallLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const [height, setHeight] = useState(0);
  const backdrop = wallBackdrop(theme);
  const pages: Page[] = [...cards.map((card) => ({ kind: 'card' as const, card })), ...(atEnd && cards.length > 0 ? [{ kind: 'end' as const }] : [])];

  return (
    <View style={[styles.root, { backgroundColor: backdrop }]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)} testID="wall-layout">
      {height > 0 ? (
        <FlatList
          data={pages}
          keyExtractor={(p, i) => (p.kind === 'card' ? p.card.id : `${p.kind}-${i}`)}
          renderItem={({ item, index }) => (
            <View style={[styles.page, { height }]}>
              {item.kind === 'card' ? (
                <View style={styles.inner}>
                  {index === 0 ? header : null}
                  {item.card.id === pinnedId ? <Tr k="feed.pinned" style={styles.light} /> : null}
                  <View style={styles.card}>{renderCard(item.card)}</View>
                  <Text
                    style={styles.light}
                    accessibilityLabel={t('wall.position', {
                      n: index + 1,
                      total: cards.length,
                    })}
                  >
                    {index + 1} / {cards.length}
                    {index === 0 ? ` · ${t('wall.swipe')}` : ''}
                  </Text>
                </View>
              ) : (
                <View style={[styles.inner, { alignItems: 'center' }]}>
                  <Tr k="layout.lastPage" style={[type.heading, { color: '#FFFFFF' }]} />
                  <Tr k="layout.allSeen" style={styles.light} />
                </View>
              )}
            </View>
          )}
          pagingEnabled
          decelerationRate="fast"
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={3}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
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
  page: { justifyContent: 'center' },
  inner: { paddingHorizontal: space.sm, paddingBottom: 72, gap: space.sm },
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  // Light text on the dark wall (white on #101418 is well over 4.5:1).
  light: {
    ...type.small,
    color: '#E8ECF0',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
