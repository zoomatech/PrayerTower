// Moderation queue for moderators and admins: appeals, then reported and AI-flagged items,
// with the content, why it is here, and the decision buttons. Every decision
// is logged on the server.
import { MODERATION_RULES, type Appeal, type ModerationItem, type ModerationRule } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CircleRequests } from '@/components/circle-requests';
import { HarmFloods } from '@/components/harm-admin';
import { BreakCard, HandoffRow, HardText, useModeratorCare } from '@/components/moderator-care';
import { OncallBanner } from '@/components/oncall';
import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { MendQueue } from '@/components/gentle-repair';
import { CalmThreadsQueue } from '@/components/calm-thread';
import { colors, radius, space, type } from '@/lib/theme';

const RULE_CHOICES = (Object.keys(MODERATION_RULES) as ModerationRule[]).filter((r) => r !== 'safe_messaging');

function Moderation() {
  const { t, label, language: locale } = useLocale();
  const { pressureRule, misleadingRule, automationRule, legalReview } = useFeatures();
  // Rules with a switch are offered only while it is on.
  const switchedOn: Partial<Record<ModerationRule, boolean>> = { pressure: pressureRule, misleading: misleadingRule, automation: automationRule };
  const ruleChoices = RULE_CHOICES.filter((r) => switchedOn[r] ?? true);
  const [escalated, setEscalated] = useState<Record<string, boolean>>({});
  const ruleLabel = (r: ModerationRule) => label('moderationRule', r, MODERATION_RULES[r]);
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, ModerationRule>>({});
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const care = useModeratorCare();
  const [flags, setFlags] = useState<Awaited<ReturnType<typeof api.activityFlags>>['flags']>([]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [q, a, f] = await Promise.all([api.moderationQueue(), api.appeals(), api.activityFlags()]);
      setFlags(f.flags);
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

  // Sends the report to the admins (Admin → Legal requests). The item stays in the queue for a decision.
  const escalate = async (item: ModerationItem) => {
    try {
      await api.escalate(item.id, `Escalated from the moderation queue. Reason given: ${item.reason ?? 'none'}`);
      setEscalated((s) => ({ ...s, [item.id]: true }));
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
        <CircleRequests />
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.moderation')}</Text>
        <ErrorText error={error} />
        <OncallBanner />
        <BreakCard care={care} />
        {/* On a break the queue steps aside until the moderator comes back (moderator care). */}
        {care.onBreak ? null : (
          <>
        <HarmFloods onError={setError} />
        <MendQueue />
        <CalmThreadsQueue />
        {flags.length ? <Text style={type.heading}>{t('moderation.flagsTitle')}</Text> : null}
        {flags.map((f) => (
          <View key={f.id} style={styles.item}>
            <Text style={styles.meta}>
              {f.name} · {f.reason === 'too_many' ? t('moderation.tooMany', { count: Number(f.details.taps) }) : t('moderation.regular', { count: Number(f.details.taps) })}
            </Text>
            <Text style={type.small}>{t('moderation.flagHint')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button small variant="secondary" label={t('moderation.human')} onPress={() => api.decideActivityFlag(f.id, 'cleared').then(load).catch((e) => setError((e as Error).message))} />
              <Button small variant="ghost" label={t('moderation.automated')} onPress={() => api.decideActivityFlag(f.id, 'confirmed').then(load).catch((e) => setError((e as Error).message))} />
              <Button small variant="ghost" label={t('moderation.profile')} onPress={() => router.push(`/people/${f.userId}`)} />
            </View>
          </View>
        ))}
        {appeals.length ? <Text style={type.heading}>{t('moderation.appeals')}</Text> : null}
        {appeals.map((a) => (
          <View key={a.id} style={styles.item}>
            <Text style={type.small}>
              {t('moderation.removedFor', { target: t(`moderation.target.${a.target_type}`), rule: ruleLabel(a.rule ?? 'other') })}
              {a.suspended_until ? ` · ${t('moderation.suspendedUntil', { date: new Date(a.suspended_until).toLocaleDateString(locale) })}` : ''}
            </Text>
            <Text style={type.body}>{a.content ?? t('moderation.gone')}</Text>
            <Text style={styles.appeal}>{t('moderation.theirAppeal', { message: a.message })}</Text>
            <View style={styles.row}>
              <Button small variant="secondary" label={t('moderation.uphold')} onPress={() => decideAppeal(a, 'uphold')} />
              <Button small label={t('moderation.overturn')} onPress={() => decideAppeal(a, 'overturn')} />
            </View>
          </View>
        ))}
        {appeals.length ? <Text style={type.heading}>{t('moderation.queue')}</Text> : null}
        {items.length === 0 && !refreshing ? <Empty text={t('moderation.empty')} /> : null}
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.meta}>
              {t(`moderation.target.${item.target_type}`)} · {t(`moderation.source.${item.source}`)} ·{' '}
              {new Date(item.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}
            </Text>
            <HardText item={item} care={care} />
            {item.reason ? <Text style={styles.reason}>{t('moderation.why', { reason: item.reason })}</Text> : null}
            <HandoffRow item={item} care={care} onDone={() => setItems((prev) => prev.filter((i) => i.id !== item.id))} onError={setError} />
            {item.source === 'crisis' ? (
              // Someone may be in danger: reach out and keep it up; remove only method details. Never suspend.
              <View style={styles.row}>
                <Button small variant="secondary" label={t('moderation.reachedOut')} onPress={() => decide(item, { action: 'dismiss', note: 'Crisis support offered' })} />
                <Button
                  small
                  label={t('moderation.removeMethod')}
                  onPress={() => decide(item, { action: 'remove', rule: 'safe_messaging', note: 'Removed method details (safe messaging)' })}
                />
              </View>
            ) : (
              <>
                <Text style={type.small}>{t('moderation.ruleBroken')}</Text>
                <View style={styles.row}>
                  {ruleChoices.map((r) => (
                    <Chip key={r} label={ruleLabel(r)} selected={(rules[item.id] ?? 'other') === r} onPress={() => setRules((s) => ({ ...s, [item.id]: r }))} />
                  ))}
                </View>
                <View style={styles.row}>
                  <Button
                    small
                    variant="secondary"
                    label={care.restore && item.auto_hidden ? t('modCare.restore') : t('moderation.keep')}
                    onPress={() => decide(item, { action: 'dismiss' })}
                  />
                  <Button small label={t('moderation.remove')} onPress={() => decide(item, { action: 'remove', rule: rules[item.id] ?? 'other' })} />
                  <Button
                    small
                    label={t('moderation.removeSuspend')}
                    onPress={() =>
                      decide(item, { action: 'remove', rule: rules[item.id] ?? 'other', suspendDays: 7, note: 'Suspended from the moderation queue' })
                    }
                  />
                </View>
              </>
            )}
            {legalReview ? (
              escalated[item.id] ? (
                <Text style={type.small}>{t('moderation.escalated')}</Text>
              ) : (
                <Button small variant="ghost" label={t('moderation.escalate')} onPress={() => escalate(item)} />
              )
            ) : null}
          </View>
        ))}
          </>
        )}
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

export default staffOnly(Moderation, ['moderator', 'admin']);
