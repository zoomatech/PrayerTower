// Staff: members asking for more free radio prayers, paid from the shared fund.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type AllocationRequestRow } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function RadioRequestsScreen() {
  const { t } = useLocale();
  const [requests, setRequests] = useState<AllocationRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.radioRequests().then((r) => (setRequests(r.requests), setError(null)), (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const decide = (id: string, grant: number) =>
    api
      .decideRadioRequest(id, grant)
      .then(() => setRequests((rs) => rs?.filter((r) => r.id !== id) ?? null))
      .catch((e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('radioRequests.title')}</Text>
        <ErrorText error={error} onRetry={requests ? undefined : load} />
        {!requests && !error ? <Loading /> : null}
        {requests && !requests.length ? <Text style={type.body}>{t('radioRequests.none')}</Text> : null}
        {requests?.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={type.heading}>{t('radioRequests.asks', { name: r.name, count: r.count })}</Text>
            {r.note ? <Text style={type.body}>{r.note}</Text> : null}
            <Text style={type.small}>{t('radioRequests.sent', { count: r.sent_last_30_days })}</Text>
            <View style={styles.row}>
              <Button small label={t('radioRequests.grant', { count: r.count })} onPress={() => decide(r.id, r.count)} />
              {r.count > 1 ? <Button small variant="secondary" label={t('radioRequests.grant', { count: 1 })} onPress={() => decide(r.id, 1)} /> : null}
              <Button small variant="ghost" label={t('radioRequests.decline')} onPress={() => decide(r.id, 0)} />
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
