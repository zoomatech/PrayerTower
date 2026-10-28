// V1 layout: the familiar single column, newest request pinned first.
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Tr } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';

export function ColumnLayout({ cards, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  return (
    <FlatList
      data={cards}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <View>
          {item.id === pinnedId ? <Tr k="feed.pinned" style={styles.pinned} /> : null}
          {renderCard(item)}
        </View>
      )}
      ListHeaderComponent={header ?? undefined}
      ListFooterComponent={atEnd && cards.length > 0 ? <Text style={styles.end}>You have seen every prayer for now. Thank you for praying.</Text> : undefined}
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
  end: { ...type.small, textAlign: 'center', padding: space.xl },
});
