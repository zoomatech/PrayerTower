// Scheduled token gifts: tokens set to go to a request at a chosen time.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api, type ScheduledSpend } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

const STATUS: Record<ScheduledSpend['status'], string> = { active: 'Scheduled', done: 'Done', cancelled: 'Cancelled', failed: 'Did not go out' };

export default function ScheduledScreen() {
  const [items, setItems] = useState<ScheduledSpend[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.scheduledSpends().then((r) => setItems(r.schedules), (e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Scheduled gifts</Text>
        <Text style={type.body}>Tokens you set to go to a request later. They are taken when the time comes. Schedule one from Gift Tokens on any request.</Text>
        <ErrorText error={error} />
        {items?.length === 0 ? <Empty text="Nothing scheduled." /> : null}
        {items?.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={type.body} onPress={() => router.push(`/post/${s.post_id}`)}>
              “{s.excerpt}”
            </Text>
            <Text style={type.small}>
              {STATUS[s.status]} · {s.amount} tokens
              {s.status === 'active'
                ? ` on ${new Date(s.next_run_at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : ''}
              {s.repeat_weeks > 1 ? ` · ${s.runs} of ${s.repeat_weeks} weeks` : ''}
            </Text>
            {s.error ? <Text style={type.small}>{s.error}</Text> : null}
            {s.status === 'active' ? (
              <Button small variant="ghost" label="Cancel" onPress={() => api.cancelScheduledSpend(s.id).then(load, (e) => setError((e as Error).message))} />
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
