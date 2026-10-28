// Messages: conversations between people who asked for prayer and people who
// prayed for them, one per request.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api, type Conversation } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function MessagesScreen() {
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    api
      .conversations()
      .then((r) => setItems(r.conversations), (e) => setError((e as Error).message))
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(load);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Messages</Text>
        <Text style={type.small}>
          Talk with the people you prayed for, and the people who prayed for you. Start one from a request you prayed for.
        </Text>
        <ErrorText error={error} />
        {items?.length === 0 ? <Empty text="No messages yet." /> : null}
        {items?.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.item, c.unread && styles.unread]}
            onPress={() => router.push(`/messages/${c.id}`)}
            accessibilityRole="link"
          >
            <Text style={styles.name}>{c.with.displayName}</Text>
            <Text style={type.small} numberOfLines={1}>
              About: {c.postPreview}
            </Text>
            {c.lastMessage ? (
              <Text style={type.body} numberOfLines={2}>
                {c.lastMessage}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: 4 },
  unread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  name: { fontWeight: '700', fontSize: 16, color: colors.text },
});
