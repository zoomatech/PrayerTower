// V1 layout: the familiar single column, newest request pinned first.
import { FlatList, StyleSheet, View } from 'react-native';

import { Tr } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';

export function ColumnLayout({ cards, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd, columns = 1 }: FeedLayoutProps) {
  return (
    <FlatList
      // FlatList can't change numColumns in place.
      key={columns}
      numColumns={columns}
      columnWrapperStyle={columns > 1 ? styles.row : undefined}
      data={cards}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <View style={columns > 1 ? styles.cell : undefined}>
          {item.id === pinnedId ? <Tr k="feed.pinned" style={styles.pinned} /> : null}
          {renderCard(item)}
        </View>
      )}
      ListHeaderComponent={header ?? undefined}
      ListFooterComponent={atEnd && cards.length > 0 ? <Tr k="layout.allSeen" style={styles.end} /> : undefined}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      {...feedListTuning}
    />
  );
}

const Separator = () => <View style={{ height: space.lg }} />;

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  pinned: { ...type.small, color: colors.primary, fontWeight: '700', marginBottom: space.xs },
  row: { gap: space.lg },
  cell: { flex: 1, minWidth: 0 },
  end: { ...type.small, textAlign: 'center', padding: space.xl },
});
