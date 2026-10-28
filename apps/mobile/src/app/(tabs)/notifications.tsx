import type { AppNotification } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function Notifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      api.conversations().then((c) => setUnread(c.unread), () => undefined);
      const { notifications } = await api.notifications();
      setItems(notifications);
      const unread = notifications.filter((n) => !n.read_at).map((n) => n.id);
      if (unread.length) api.markRead(unread).catch(() => undefined);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.header}>
          <Text style={type.title}>Notices</Text>
          <View style={styles.headerButtons}>
            <Button small variant="secondary" label="Groups" onPress={() => router.push('/groups')} />
            <Button small variant="secondary" label={unread ? `Messages (${unread})` : 'Messages'} onPress={() => router.push('/messages')} />
          </View>
        </View>
        <ErrorText error={error} />
        {items.length === 0 ? <Empty text="When someone prays for you, you will see it here." /> : null}
        {items.map((n) => {
          const postId = typeof n.data.postId === 'string' ? n.data.postId : null;
          const conversationId = typeof n.data.conversationId === 'string' ? n.data.conversationId : null;
          const groupId = typeof n.data.groupId === 'string' ? n.data.groupId : null;
          return (
            <Pressable
              key={n.id}
              style={[styles.item, !n.read_at && styles.unread]}
              onPress={() =>
                conversationId
                  ? router.push(`/messages/${conversationId}`)
                  : groupId
                    ? router.push(`/groups/${groupId}`)
                    : postId && router.push(`/post/${postId}`)
              }
              accessibilityRole={postId ? 'link' : undefined}>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={type.body}>{n.body}</Text>
              <Text style={type.small}>{new Date(n.created_at).toLocaleString()}</Text>
              {n.kind === 'moderation_notice' && typeof n.data.itemId === 'string' ? (
                <Button small variant="secondary" label="Appeal this decision" onPress={() => router.push(`/appeal/${n.data.itemId}`)} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: 4 },
  unread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  title: { fontWeight: '700', fontSize: 16, color: colors.text },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  headerButtons: { flexDirection: 'row', gap: space.sm },
});
