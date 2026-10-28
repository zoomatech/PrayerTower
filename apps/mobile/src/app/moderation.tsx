// Moderation queue for moderators and admins: appeals, then reported and AI-flagged items,
// with the content, why it is here, and the decision buttons. Every decision
// is logged on the server.
import { MODERATION_RULES, type Appeal, type ModerationItem, type ModerationRule } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

const SOURCE_LABEL = { ai: 'Flagged automatically', report: 'Reported by a member', crisis: 'May need support' } as const;
const RULE_CHOICES = (Object.keys(MODERATION_RULES) as ModerationRule[]).filter((r) => r !== 'safe_messaging');
const TARGET_LABEL = { post: 'Request', comment: 'Comment', reaction: 'Encouragement', message: 'Private message', event: 'Event' } as const;

export default function Moderation() {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, ModerationRule>>({});
  const [appeals, setAppeals] = useState<Appeal[]>([]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [q, a] = await Promise.all([api.moderationQueue(), api.appeals()]);
      setItems(q.items);
      setAppeals(a.appeals);
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

  const decide = async (item: ModerationItem, decision: Parameters<typeof api.decide>[1]) => {
    try {
      await api.decide(item.id, decision);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const decideAppeal = async (a: Appeal, action: 'uphold' | 'overturn') => {
    try {
      await api.decideAppeal(a.id, action);
      setAppeals((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Moderation</Text>
        <ErrorText error={error} />
        {appeals.length ? <Text style={type.heading}>Appeals</Text> : null}
        {appeals.map((a) => (
          <View key={a.id} style={styles.item}>
            <Text style={type.small}>
              {TARGET_LABEL[a.target_type]} removed for “{a.rule ? MODERATION_RULES[a.rule] : 'Community rules'}”
              {a.suspended_until ? ` · suspended until ${new Date(a.suspended_until).toLocaleDateString()}` : ''}
            </Text>
            <Text style={type.body}>{a.content ?? '(content no longer available)'}</Text>
            <Text style={styles.appeal}>Their appeal: {a.message}</Text>
            <View style={styles.row}>
              <Button small variant="secondary" label="Keep the decision" onPress={() => decideAppeal(a, 'uphold')} />
              <Button small label="Overturn and restore" onPress={() => decideAppeal(a, 'overturn')} />
            </View>
          </View>
        ))}
        {appeals.length ? <Text style={type.heading}>Queue</Text> : null}
        {items.length === 0 && !refreshing ? <Empty text="Nothing waiting for review." /> : null}
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.meta}>
              {TARGET_LABEL[item.target_type]} · {SOURCE_LABEL[item.source]} ·{' '}
              {new Date(item.created_at).toLocaleString()}
            </Text>
            <Text style={type.body}>{item.content ?? '(content no longer available)'}</Text>
            {item.reason ? <Text style={styles.reason}>Why: {item.reason}</Text> : null}
            {item.source === 'crisis' ? (
              // Someone may be in danger: reach out and keep it up; remove only method details. Never suspend.
              <View style={styles.row}>
                <Button small variant="secondary" label="Reached out, keep it" onPress={() => decide(item, { action: 'dismiss', note: 'Crisis support offered' })} />
                <Button
                  small
                  label="Remove method details"
                  onPress={() => decide(item, { action: 'remove', rule: 'safe_messaging', note: 'Removed method details (safe messaging)' })}
                />
              </View>
            ) : (
              <>
                <Text style={type.small}>Rule broken (the member is told):</Text>
                <View style={styles.row}>
                  {RULE_CHOICES.map((r) => (
                    <Chip key={r} label={MODERATION_RULES[r]} selected={(rules[item.id] ?? 'other') === r} onPress={() => setRules((s) => ({ ...s, [item.id]: r }))} />
                  ))}
                </View>
                <View style={styles.row}>
                  <Button small variant="secondary" label="Keep it" onPress={() => decide(item, { action: 'dismiss' })} />
                  <Button small label="Remove" onPress={() => decide(item, { action: 'remove', rule: rules[item.id] ?? 'other' })} />
                  <Button
                    small
                    label="Remove and suspend 7 days"
                    onPress={() =>
                      decide(item, { action: 'remove', rule: rules[item.id] ?? 'other', suspendDays: 7, note: 'Suspended from the moderation queue' })
                    }
                  />
                </View>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  meta: { ...type.small, fontWeight: '600' },
  reason: { ...type.small, color: colors.danger },
  appeal: { ...type.body, fontStyle: 'italic' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
