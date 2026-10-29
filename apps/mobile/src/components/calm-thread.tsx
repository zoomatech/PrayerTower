// Calm threads: when a comment thread heats up, everyone in it sees a calm, Ted Lasso-style
// note; moderators see the thread and decide whether it's fine or should slow down for a
// while. The app itself never limits anyone.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/ui';
import { api, type CalmState, type CalmThread } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

/** The note above a warm or slowed thread. `refresh` changes after each new comment. */
export function CalmBanner({ postId, refresh }: { postId: string; refresh: unknown }) {
  const { calmThreads } = useFeatures();
  const t = useT();
  const [calm, setCalm] = useState<CalmState | null>(null);
  useEffect(() => {
    if (!calmThreads) return;
    let live = true;
    api.calmThread(postId).then((r) => live && setCalm(r.calm), () => undefined);
    return () => {
      live = false;
    };
  }, [calmThreads, postId, refresh]);
  if (!calmThreads || !calm) return null;
  return (
    <View style={styles.banner} testID="calm-banner" accessibilityRole="summary">
      <Text style={type.heading} accessibilityRole="header">
        🌤️ {t('calm.title')}
      </Text>
      <Text style={type.body}>{calm.kind === 'slow' ? t('calm.slow', { minutes: calm.minutes }) : t('calm.warm')}</Text>
      <Text style={type.small}>{t('calm.ted')}</Text>
    </View>
  );
}

/** Moderation: warm threads waiting for a person. Only counts are shown, never the heated words. */
export function CalmThreadsQueue() {
  const { calmThreads } = useFeatures();
  const t = useT();
  const [threads, setThreads] = useState<CalmThread[]>([]);
  const load = useCallback(() => {
    if (!calmThreads) return;
    api.calmThreads().then((r) => setThreads(r.threads), () => undefined);
  }, [calmThreads]);
  useFocusEffect(load);
  if (!calmThreads || !threads.length) return null;
  const decide = (postId: string, action: 'settle' | 'slow') => api.decideCalmThread(postId, action).then(load, () => undefined);
  return (
    <View style={styles.queue} testID="calm-queue">
      <Text style={type.heading} accessibilityRole="header">
        {t('calm.queueTitle')}
      </Text>
      <Text style={type.small}>{t('calm.queueHint')}</Text>
      {threads.map((th) => (
        <View key={th.postId} style={styles.item}>
          <Text style={type.body} accessibilityRole="link" onPress={() => router.push(`/post/${th.postId}`)}>
            “{th.preview}”
          </Text>
          <Text style={type.small}>{t('calm.counts', { heated: th.heated, people: th.people })}</Text>
          <View style={styles.row}>
            <Button small variant="secondary" label={t('calm.settle')} onPress={() => decide(th.postId, 'settle')} />
            <Button small variant="secondary" label={t('calm.slowDown')} onPress={() => decide(th.postId, 'slow')} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  queue: { gap: space.sm },
  item: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
