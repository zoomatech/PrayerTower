// Prayer Cast: the log of prayers that actually went out by radio. Only the
// request text is ever sent or shown here, never a name. No estimated reach
// or distance: only real records.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api, type PrayerCast } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function PrayerCastScreen() {
  const [data, setData] = useState<PrayerCast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    api
      .prayerCast()
      .then(setData, (e) => setError((e as Error).message))
      .finally(() => setRefreshing(false));
  }, []);
  useEffect(load, [load]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Prayer Cast</Text>
        <Text style={type.body}>
          Prayers that went out by radio. Only the words of the request are sent, never a name. Send one from any request with “Send as a radio
          prayer”.
        </Text>
        <ErrorText error={error} />
        {data ? (
          <View style={styles.totals}>
            <Text style={styles.total}>{data.totals.prayers}</Text>
            <Text style={type.small}>prayers sent</Text>
            <Text style={[styles.total, { marginLeft: space.lg }]}>{data.totals.sends}</Text>
            <Text style={type.small}>transmissions</Text>
          </View>
        ) : null}
        {data?.cast.length === 0 ? <Empty text="No prayers have gone out yet." /> : null}
        {data?.cast.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={type.body} onPress={() => router.push(`/post/${c.post_id}`)}>
              “{c.text}”
            </Text>
            <Text style={type.small}>
              {new Date(c.transmitted_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {c.repeats > 1 ? ` · amplified, sent ${c.repeats} times` : ''}
              {c.call_sign ? ` · ${c.call_sign}` : c.transmitter === 'log' ? ' · test log (no radio yet)' : ''}
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
