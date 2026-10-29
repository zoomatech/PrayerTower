import type { AppNotification } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { notificationTarget } from '@/lib/notification-target';
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

  // A path back after a removal: the author's own words open in the composer to change and share again.
  const postAgain = (itemId: string) =>
    api.removedWords(itemId).then(
      (w) =>
        router.push(
          w.target === 'post'
            ? `/compose?body=${encodeURIComponent(w.body)}${w.postType === 'praise' ? '&type=praise' : ''}`
            : `/post/${w.postId}?draft=${encodeURIComponent(w.body)}`,
        ),
      (e) => setError((e as Error).message),
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Text style={type.title}>{t('tabs.notices')}</Text>
        <ErrorText error={error} onRetry={load} />
        {!loaded && !error ? <Loading /> : null}
        {loaded && items.length === 0 ? <Empty text={t('notices.empty')} /> : null}
        {items.map((n) => {
          const target = notificationTarget(n.data);
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
              {n.kind === 'moderation_notice' && n.data.pathBack === true && typeof n.data.itemId === 'string' ? (
                <Button small variant="secondary" label={t('pathBack.again')} onPress={() => postAgain(n.data.itemId as string)} />
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
