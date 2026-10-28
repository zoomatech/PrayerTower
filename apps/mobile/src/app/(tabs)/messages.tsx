// Messages tab (Features Set 2): notes between pray-ers and the people they
// prayed for, direct messages, and prayer & topical group chats. Message
// requests and group invites come first.
import type { ConversationSummary } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

const KIND_LABEL = { prayer: 'Prayer note', direct: 'Message', group: 'Group', care: 'Prayer partner' } as const;

export default function Messages() {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems((await api.conversations()).conversations);
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

  const requests = items.filter((c) => c.isRequest);
  const rest = items.filter((c) => !c.isRequest);

  const row = (c: ConversationSummary) => (
    <Pressable key={c.id} style={[styles.item, c.unread > 0 && styles.unread]} onPress={() => router.push(`/conversation/${c.id}`)} accessibilityRole="link">
      <View style={styles.rowTop}>
        <Text style={styles.title} numberOfLines={1}>
          {c.title}
        </Text>
        <Text style={type.script}>{KIND_LABEL[c.kind]}</Text>
      </View>
      {c.kind === 'group' ? (
        <Text style={type.small}>
          {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
          {c.isPublic ? ' · open to all' : ' · invite only'}
        </Text>
      ) : null}
      {c.lastMessage ? (
        <Text style={type.body} numberOfLines={2}>
          {c.lastMessage}
        </Text>
      ) : null}
      {c.unread > 0 ? <Text style={styles.badge}>{c.unread} new</Text> : null}
    </Pressable>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Text style={type.title}>Messages</Text>
        <Text style={type.small}>Private notes stay between you, but a message can be reviewed by a moderator if someone reports it.</Text>
        <View style={styles.links}>
          <Button variant="secondary" label="Prayer groups" onPress={() => router.push('/groups')} />
          <Button variant="secondary" label="Meetings & events" onPress={() => router.push('/events')} />
          <Button variant="secondary" label="Pray with someone now" onPress={() => router.push('/care')} />
        </View>
        <ErrorText error={error} />
        {requests.length ? <Text style={type.heading}>Requests and invites</Text> : null}
        {requests.map(row)}
        {requests.length && rest.length ? <Text style={type.heading}>Conversations</Text> : null}
        {rest.map(row)}
        {items.length === 0 ? (
          <Empty text="After you pray for someone, you can send them a private note from their request. You can also message people who follow you back, or join a prayer group." />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: 4 },
  unread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.text },
  badge: { alignSelf: 'flex-start', color: '#fff', backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: space.sm, fontSize: 12, overflow: 'hidden' },
});
