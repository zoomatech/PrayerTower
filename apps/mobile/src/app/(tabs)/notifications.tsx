import type { AppNotification } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function Notifications() {
  const { t } = useLocale();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { notifications } = await api.notifications();
      setItems(notifications);
      setLoaded(true);
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
        <Text style={type.title}>{t('tabs.notices')}</Text>
        <ErrorText error={error} onRetry={load} />
        {!loaded && !error ? <Loading /> : null}
        {loaded && items.length === 0 ? <Empty text={t('notices.empty')} /> : null}
        {items.map((n) => {
          const postId = typeof n.data.postId === 'string' ? n.data.postId : null;
          const conversationId = typeof n.data.conversationId === 'string' ? n.data.conversationId : null;
          const eventId = typeof n.data.eventId === 'string' ? n.data.eventId : null;
          const careRequestId = typeof n.data.careRequestId === 'string' ? n.data.careRequestId : null;
          const storyId = typeof n.data.storyId === 'string' ? n.data.storyId : null;
          const mendId = typeof n.data.mendId === 'string' ? n.data.mendId : null;
          const target = mendId ? `/mend/${mendId}` : storyId ? '/help-stories' : careRequestId ? '/care' : conversationId ? `/conversation/${conversationId}` : eventId ? `/event/${eventId}` : postId ? `/post/${postId}${n.data.believe ? '?believe=1' : ''}` : n.data.screen === 'highlights' ? '/highlights' : n.data.screen === 'prayer-minute' ? '/prayer-minute' : n.data.screen === 'give' ? '/give' : n.data.screen === 'radio-requests' ? '/radio-requests' : n.data.screen === 'gratitude' || n.data.screen === 'encourager' || n.data.screen === 'partner' ? '/profile' : n.data.screen === 'prayer-list' ? '/prayer-list' : typeof n.data.personId === 'string' ? `/people/${n.data.personId}` : null;
          return (
            <Pressable
              key={n.id}
              style={[styles.item, !n.read_at && styles.unread]}
              onPress={() => target && router.push(target)}
              accessibilityRole={target ? 'link' : undefined}>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={type.body}>{n.body}</Text>
              <Text style={type.small}>{new Date(n.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              {n.kind === 'moderation_notice' && typeof n.data.itemId === 'string' ? (
                <Button small variant="secondary" label={t('notices.appeal')} onPress={() => router.push(`/appeal/${n.data.itemId}`)} />
              ) : null}
              {n.kind === 'held_for_review' && n.data.explainable === true && typeof n.data.itemId === 'string' ? (
                <Button small variant="secondary" label={t('notices.explain')} onPress={() => router.push(`/appeal/${n.data.itemId}?held=1`)} />
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
});
