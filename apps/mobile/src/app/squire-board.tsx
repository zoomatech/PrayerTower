// Prayer Squire board (PrayerTower_ConceptDoc): the public track, off unless an admin
// turns it on. Members choose to appear; anonymous members stay on the private track
// and never appear. Ranks verified prayers for other people in the member's community.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Loading, Screen, Toggle } from '@/components/ui';
import { api, type SquireBoard } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function SquireBoardScreen() {
  const { t } = useLocale();
  const [board, setBoard] = useState<SquireBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.resolve()
      .then(() => api.squireBoard())
      .then(setBoard, (e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  const choose = (on: boolean) =>
    api.setSquireBoard(on).then(setBoard, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} accessibilityRole="header">
          {t('squire.title')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : board === null ? <Loading /> : null}
        {board && !board.enabled ? <Text style={type.body}>{t('squire.off')}</Text> : null}
        {board?.enabled ? (
          <>
            <Text style={type.body}>{t('squire.intro', { days: board.days })}</Text>
            {board.canJoin ? (
              <Toggle label={t('squire.join')} hint={t('squire.joinHint')} value={board.onBoard} onChange={choose} />
            ) : (
              <Text style={type.small}>{t('squire.anonymous')}</Text>
            )}
            {board.entries.length === 0 ? <Text style={type.small}>{t('squire.empty')}</Text> : null}
            {board.entries.map((e) => (
              <View key={e.personId} style={[styles.row, e.you && styles.you]}>
                <Text style={styles.rank}>{e.rank}</Text>
                <View style={styles.who}>
                  <Text style={styles.name} onPress={() => router.push(`/people/${e.personId}`)} accessibilityRole="link">
                    {e.you ? t('squire.you', { name: e.name }) : e.name}
                  </Text>
                  <Text style={type.small}>{t('squire.counts', { count: e.prayers, people: e.peoplePrayedFor })}</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  you: { borderColor: colors.primary },
  rank: { ...type.heading, minWidth: 28, textAlign: 'center' },
  who: { flex: 1, gap: 2 },
  name: { ...type.body, fontWeight: '700' },
});
