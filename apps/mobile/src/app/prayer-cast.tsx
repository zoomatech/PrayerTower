// Prayer Cast: the log of prayers that actually went out by radio. Only the
// request text is ever sent or shown here, never a name. No estimated reach
// or distance: only real records.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type PrayerCast } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function PrayerCastScreen() {
  const { t, n } = useLocale();
  const [data, setData] = useState<PrayerCast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    api
      .prayerCast()
      .then((d) => (setData(d), setError(null)), (e) => setError((e as Error).message))
      .finally(() => setRefreshing(false));
  }, []);
  useEffect(load, [load]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{n('Prayer Cast')}</Text>
        <Text style={type.body}>
          {t('cast.intro')}
        </Text>
        <ErrorText error={error} onRetry={data ? undefined : load} />
        {!data && !error ? <Loading /> : null}
        {data ? (
          <View style={styles.totals}>
            <Text style={styles.total}>{data.totals.prayers}</Text>
            <Text style={type.small}>{t('cast.sent')}</Text>
            <Text style={[styles.total, { marginLeft: space.lg }]}>{data.totals.sends}</Text>
            <Text style={type.small}>{t('cast.transmissions')}</Text>
          </View>
        ) : null}
        {data?.cast.length === 0 ? <Empty text={t('cast.empty')} /> : null}
        {data?.cast.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={type.body} onPress={() => router.push(`/post/${c.post_id}`)}>
              “{c.text}”
            </Text>
            <Text style={type.small}>
              {new Date(c.transmitted_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {c.repeats > 1 ? ` · ${t('cast.amplified', { count: c.repeats })}` : ''}
              {c.call_sign ? ` · ${c.call_sign}` : c.transmitter === 'log' ? ` · ${t('cast.testLog')}` : ''}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  totals: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  total: { fontSize: 22, fontWeight: '700', color: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
});
