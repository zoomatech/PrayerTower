// Scheduled token gifts: tokens set to go to a request at a chosen time.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type ScheduledSpend } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';


export default function ScheduledScreen() {
  const { t } = useLocale();
  const [items, setItems] = useState<ScheduledSpend[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.scheduledSpends().then((r) => (setItems(r.schedules), setError(null)), (e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.scheduled')}</Text>
        <Text style={type.body}>{t('scheduled.intro')}</Text>
        <ErrorText error={error} onRetry={items ? undefined : load} />
        {!items && !error ? <Loading /> : null}
        {items?.length === 0 ? <Empty text={t('scheduled.empty')} /> : null}
        {items?.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={type.body} onPress={() => router.push(`/post/${s.post_id}`)}>
              “{s.excerpt}”
            </Text>
            <Text style={type.small}>
              {t(`scheduled.status.${s.status}`)} · {s.action === 'radio' || s.action === 'amplify' ? t(`scheduled.${s.action}`) : t('scheduled.tokens', { count: s.amount })}
              {s.status === 'active'
                ? ` · ${new Date(s.next_run_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : ''}
              {s.repeat_weeks > 1 ? ` · ${t('scheduled.weeks', { done: s.runs, total: s.repeat_weeks })}` : ''}
            </Text>
            {s.error ? <Text style={type.small}>{s.error}</Text> : null}
            {s.status === 'active' ? (
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => api.cancelScheduledSpend(s.id).then(load, (e) => setError((e as Error).message))} />
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
});
