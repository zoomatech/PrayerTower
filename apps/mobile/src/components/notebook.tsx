// Notebook ideas on the feed (Batch 7): the worldwide prayer count and the
// thanksgiving card (Notes Page 14: "Add thanksgiving reminders to feed?").
// Both are real data and hide when an admin switches them off.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrisisSupport } from '@/components/crisis';
import { Button, ErrorText, Field } from '@/components/ui';
import { api, type EventInput, type WorldwideStats } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

export function WorldwideCount() {
  const { t, language } = useLocale();
  const features = useFeatures();
  const [stats, setStats] = useState<WorldwideStats | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.worldwide().then((r) => setStats(r.stats), () => undefined);
    }, []),
  );
  if (!features.worldwideCount || !stats?.enabled || stats.prayersToday === 0) return null;
  return (
    <Text style={styles.count} accessibilityRole="text">
      🌍 {t('notebook.worldwide', { count: stats.prayersToday, formatted: stats.prayersToday.toLocaleString(language), people: stats.peopleToday })}
    </Text>
  );
}

export function ThanksCard() {
  const { t } = useLocale();
  const features = useFeatures();
  const [card, setCard] = useState<{ show: boolean; answeredYouPrayedFor: number } | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.thanksCard().then((r) => setCard(r.card), () => undefined);
    }, []),
  );
  if (!features.thanksCard || !card?.show) return null;
  const dismiss = () => {
    setCard(null);
    api.dismissThanksCard().catch(() => undefined);
  };
  return (
    <View style={styles.thanks} accessibilityLabel={t('notebook.thanksTitle')}>
      <Text style={type.heading}>🙌 {t('notebook.thanksTitle')}</Text>
      <Text style={type.body}>
        {card.answeredYouPrayedFor > 0 ? t('notebook.thanksAnswered', { count: card.answeredYouPrayedFor }) : t('notebook.thanksBody')}
      </Text>
      <View style={styles.row}>
        <Button small label={t('notebook.thanksPost')} onPress={() => router.push('/compose?type=praise')} />
        <Button small variant="ghost" label={t('feed.notNow')} onPress={dismiss} />
      </View>
    </View>
  );
}

/**
 * A gentle giving ask, the Mastodon way: shown once (the server marks it seen as soon
 * as it shows), only after a member has been here a while, never to someone who gave.
 */
export function GivingAsk() {
  const { t } = useLocale();
  const features = useFeatures();
  const [show, setShow] = useState(false);
  useFocusEffect(
    useCallback(() => {
      Promise.resolve()
        .then(() => api.givingAsk())
        .then(
          (r) => {
            if (!r.show) return;
            setShow(true);
            api.seenGivingAsk().catch(() => undefined);
          },
          () => undefined,
        );
    }, []),
  );
  if (!show) return null;
  const go = (path: '/give' | '/why-gifts') => {
    setShow(false);
    router.push(path);
  };
  return (
    <View style={styles.thanks} accessibilityLabel={t('notebook.givingAskTitle')}>
      <Text style={type.heading}>{t('notebook.givingAskTitle')}</Text>
      <Text style={type.body}>{t('notebook.givingAskBody')}</Text>
      <View style={styles.row}>
        <Button small label={t('whyGifts.give')} onPress={() => go('/give')} />
        {features.whyGifts ? <Button small variant="secondary" label={t('notebook.givingAskWhy')} onPress={() => go('/why-gifts')} /> : null}
        <Button small variant="ghost" label={t('feed.notNow')} onPress={() => setShow(false)} />
      </View>
    </View>
  );
}

/** "N people have prayed for your requests", for the Me screen. */
export function PrayedForYou() {
  const { t, wording } = useLocale();
  const features = useFeatures();
  const [stats, setStats] = useState<WorldwideStats | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.worldwide().then((r) => setStats(r.stats), () => undefined);
    }, []),
  );
  if (!features.worldwideCount || !stats?.enabled || stats.peoplePrayedForYou === 0) return null;
  return <Text style={type.body}>{wording === 'neutral' ? '🤝' : '🙏'} {t('notebook.prayedForYou', { count: stats.peoplePrayedForYou })}</Text>;
}

const styles = StyleSheet.create({
  count: { ...type.small, color: colors.primary, fontWeight: '600' },
  thanks: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: colors.gold },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', alignItems: 'center' },
  inputs: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  input: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm, gap: space.xs },
  remove: { fontSize: 14, color: colors.textMuted, textDecorationLine: 'underline' },
});

/**
 * Sermon and meeting inputs (Notes Page 12: "Eventually, sermon inputs?"):
 * people coming tell the host what to pray about or preach on. Only the host
 * and staff see everyone's notes; others see their own.
 */
export function EventInputs({ eventId }: { eventId: string }) {
  const { t } = useLocale();
  const features = useFeatures();
  const [data, setData] = useState<{ canSeeAll: boolean; inputs: EventInput[] } | null>(null);
  const [draft, setDraft] = useState('');
  const [crisis, setCrisis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.eventInputs(eventId).then(setData, (e) => setError(errorText(e)));
  }, [eventId]);
  useFocusEffect(
    useCallback(() => {
      if (features.sermonInputs) load();
    }, [features.sermonInputs, load]),
  );
  if (!features.sermonInputs || !data) return null;
  const send = () =>
    api
      .addEventInput(eventId, draft.trim())
      .then((r) => {
        setDraft('');
        setCrisis(r.input.crisis);
        load();
      })
      .catch((e) => setError(errorText(e)));
  return (
    <View style={styles.inputs}>
      <Text style={type.heading}>{data.canSeeAll ? t('notebook.inputsHostTitle') : t('notebook.inputsTitle')}</Text>
      <Text style={type.small}>{data.canSeeAll ? t('notebook.inputsHostHint') : t('notebook.inputsHint')}</Text>
      {data.inputs.length === 0 && data.canSeeAll ? <Text style={type.small}>{t('notebook.inputsNone')}</Text> : null}
      {data.inputs.map((i) => (
        <View key={i.id} style={styles.input}>
          <Text style={type.body}>{i.body}</Text>
          <View style={styles.row}>
            {data.canSeeAll ? <Text style={type.small}>{i.mine ? t('notebook.inputsYou') : i.from.name}</Text> : null}
            <Text
              style={styles.remove}
              accessibilityRole="button"
              onPress={() => api.removeEventInput(eventId, i.id).then(load, (e) => setError(errorText(e)))}
            >
              {t('notebook.inputsRemove')}
            </Text>
          </View>
        </View>
      ))}
      {!data.canSeeAll || data.inputs.some((i) => i.mine) || data.inputs.length === 0 ? (
        <>
          <Field placeholder={t('notebook.inputsPlaceholder')} value={draft} onChangeText={setDraft} maxLength={500} multiline />
          <Button small label={t('notebook.inputsSend')} disabled={!draft.trim()} onPress={send} />
        </>
      ) : null}
      {crisis ? <CrisisSupport /> : null}
      <ErrorText error={error} />
    </View>
  );
}
