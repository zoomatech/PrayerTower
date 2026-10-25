import { FREQUENCY_LABELS, type Commitment, type WeeklyReview } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function Commitments() {
  const [items, setItems] = useState<Commitment[]>([]);
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [note, setNote] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c, r] = await Promise.all([api.commitments(), api.review()]);
      setItems(c.commitments);
      setNote(c.note);
      setReview(r);
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

  const act = async (fn: () => Promise<unknown>) => {
    await fn().catch((e) => setError((e as Error).message));
    load();
  };

  const active = items.filter((c) => c.status === 'active');
  const past = items.filter((c) => c.status !== 'active');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Text style={type.title}>My Promises</Text>
        {review ? (
          <View style={styles.review}>
            <Text style={styles.reviewTitle}>Your week in prayer</Text>
            <Text style={type.body}>{review.message}</Text>
          </View>
        ) : null}
        <ErrorText error={error} />
        {active.length === 0 ? <Empty text="When you commit to pray for someone, your promise appears here." /> : null}
        {active.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={type.small}>{FREQUENCY_LABELS[c.frequency]}</Text>
            <Text style={type.body} onPress={() => router.push(`/post/${c.post_id}`)}>
              {c.post_excerpt}
            </Text>
            <Text style={styles.vow}>“{c.vow_text}”</Text>
            <Text style={type.small}>
              Prayed {c.completed_count} of {c.committed_count} reminders
              {c.next_reminder_at ? ` · next ${new Date(c.next_reminder_at).toLocaleString()}` : ''}
            </Text>
            <View style={styles.row}>
              <Button small label="I prayed" onPress={() => act(() => api.checkIn(c.id))} />
              <Button small variant="secondary" label="Snooze 1 hour" onPress={() => act(() => api.snooze(c.id, 60))} />
            </View>
          </View>
        ))}
        {past.length > 0 ? <Text style={type.heading}>Past promises</Text> : null}
        {past.map((c) => (
          <View key={c.id} style={[styles.card, { opacity: 0.7 }]}>
            <Text style={type.body}>{c.post_excerpt}</Text>
            <Text style={type.small}>
              {c.status === 'completed' ? 'Completed' : 'Ended'} · prayed {c.completed_count} times
            </Text>
          </View>
        ))}
        {note ? <Text style={[type.small, { textAlign: 'center' }]}>{note}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 120 },
  review: { backgroundColor: colors.goldSoft, borderRadius: radius.lg, padding: space.lg, gap: space.xs },
  reviewTitle: { ...type.heading, color: colors.gold },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  vow: { ...type.body, fontStyle: 'italic', color: colors.primary },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
