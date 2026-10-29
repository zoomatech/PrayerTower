// Wall (beta, behind Admin → Feed skins): a solid wall of full-screen posts, one
// per swipe, like a short-video app. No fold or tilt, just a snap to the top of
// each post, on a dark backdrop from the theme's tokens. A post taller than the
// screen keeps its own height, so nothing is cut off. The feed's header (the
// composer box) is its own first page on a light panel. Same cards and the
// single row of action icons as every layout. A video fills its page and
// plays by itself, muted and looping at the 7-second limit, only while its
// page is the one on screen (components/media.tsx, WallPage).
import type { Card, FeedTheme } from '@prayer-tower/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { WallPage } from '@/components/media';

import { Tr, useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';

type Page = { kind: 'header' } | { kind: 'card'; card: Card } | { kind: 'end' };

export function wallBackdrop(theme: FeedTheme | null): string {
  const b = (theme?.tokens as Record<string, unknown> | undefined)?.backdrop;
  return typeof b === 'string' && /^#[0-9A-Fa-f]{6}$/.test(b) ? b : '#101418';
}

/** Dark text on a light backdrop (a member's skin idea may pick one), light text on a dark one. */
export function wallText(backdrop: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(backdrop.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.5 ? '#1F2328' : '#E8ECF0';
}

export function WallLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const [height, setHeight] = useState(0);
  // Each page's measured height, so the list snaps to the top of every post.
  const [heights, setHeights] = useState<Record<number, number>>({});
  const backdrop = wallBackdrop(theme);
  const light = [styles.light, { color: wallText(backdrop) }];
  const pages: Page[] = [
    ...(header ? [{ kind: 'header' as const }] : []),
    ...cards.map((card) => ({ kind: 'card' as const, card })),
    ...(atEnd && cards.length > 0 ? [{ kind: 'end' as const }] : []),
  ];
  const first = header ? 1 : 0;
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (let i = 0; i < pages.length; i++) {
      out.push(y);
      y += heights[i] ?? height;
    }
    return out;
  }, [pages.length, heights, height]);
  // The page mostly on screen is the one whose video plays.
  const [active, setActive] = useState(0);
  const viewability = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null; isViewable: boolean }[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActive(first.index);
  }).current;
  const measure = useCallback((index: number, h: number) => setHeights((prev) => (prev[index] === h ? prev : { ...prev, [index]: h })), []);

  return (
    <View style={[styles.root, { backgroundColor: backdrop }]} onLayout={(e) => setHeight(e.nativeEvent.layout.height)} testID="wall-layout">
      {height > 0 ? (
        <FlatList
          data={pages}
          keyExtractor={(p, i) => (p.kind === 'card' ? p.card.id : `${p.kind}-${i}`)}
          renderItem={({ item, index }) => (
            <View style={[styles.page, { minHeight: height }]} onLayout={(e) => measure(index, e.nativeEvent.layout.height)}>
              {item.kind === 'header' ? (
                <View style={styles.inner}>
                  <View style={styles.headerPanel}>{header}</View>
                  <Text style={light}>{t('wall.swipe')}</Text>
                </View>
              ) : item.kind === 'card' ? (
                <View style={styles.inner}>
                  {item.card.id === pinnedId ? <Tr k="feed.pinned" style={light} /> : null}
                  <WallPage.Provider value={{ active: index === active }}>
                    {/* A video post fills the page; its comments are one tap away on the icon row. */}
                    <View style={styles.card}>{renderCard(item.card.media.some((m) => m.kind === 'video') ? { ...item.card, topComment: null } : item.card)}</View>
                  </WallPage.Provider>
                  <Text style={light} accessibilityLabel={t('wall.position', { n: index - first + 1, total: cards.length })}>
                    {index - first + 1} / {cards.length}
                    {index === first && !header ? ` · ${t('wall.swipe')}` : ''}
                  </Text>
                </View>
              ) : (
                <View style={[styles.inner, { alignItems: 'center' }]}>
                  <Tr k="layout.lastPage" style={[type.heading, { color: wallText(backdrop) }]} />
                  <Tr k="layout.allSeen" style={light} />
                </View>
              )}
            </View>
          )}
          extraData={active}
          viewabilityConfig={viewability}
          onViewableItemsChanged={onViewable}
          snapToOffsets={offsets}
          snapToEnd={false}
          decelerationRate="fast"
          initialNumToRender={3}
          maxToRenderPerBatch={2}
          windowSize={5}
          showsVerticalScrollIndicator={false}
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
  inner: { paddingHorizontal: space.sm, paddingVertical: space.md, paddingBottom: 72, gap: space.sm },
  // The composer box and feed notices keep their usual light background on the wall.
  headerPanel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm },
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface },
  // Its color comes from wallText(): #E8ECF0 on #101418 is well over 4.5:1.
  light: { ...type.small, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
