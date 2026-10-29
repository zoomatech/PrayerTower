// Bible reading plan (Annotated Read, chat 2: "There could be a Bible study site"). Off
// unless an admin turns it on, and never shown in Open Circle. Members see today's passage,
// open it on a Bible website, and mark it read; admins and pastors set the plans.
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type ReadingPlanToday, type StaffReadingPlan } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function ReadingPlanScreen() {
  const { t } = useLocale();
  const [now, setNow] = useState<ReadingPlanToday | null>(null);
  const [plans, setPlans] = useState<StaffReadingPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10));
  const [refs, setRefs] = useState('');

  const load = useCallback(() => {
    setError(null);
    Promise.resolve()
      .then(() => api.readingPlan())
      .then(setNow, (e) => setError((e as Error).message));
    // Only admins and pastors can list plans; for everyone else this fails quietly.
    Promise.resolve()
      .then(() => api.staffReadingPlans())
      .then((r) => setPlans(r.plans), () => setPlans(null));
  }, []);
  useFocusEffect(load);

  const fail = (e: unknown) => setError((e as Error).message);
  const references = refs.split('\n').map((r) => r.trim()).filter(Boolean);
  const create = () =>
    api.createReadingPlan({ title: title.trim(), startsOn, references }).then(() => {
      setTitle('');
      setRefs('');
      load();
    }, fail);

  const plan = now?.enabled ? now.plan : null;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} accessibilityRole="header">
          {t('readingPlan.title')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : now === null ? <Loading /> : null}
        {now && !now.enabled ? <Text style={type.body}>{t('readingPlan.closed')}</Text> : null}
        {now?.enabled && !plan ? <Text style={type.body}>{t('readingPlan.none')}</Text> : null}
        {plan ? (
          <View style={styles.card}>
            <Text style={type.small}>{t('readingPlan.dayOf', { title: plan.title, day: plan.day, days: plan.days })}</Text>
            {plan.reading ? (
              <>
                <Text style={styles.reference}>{plan.reading.reference}</Text>
                <Button label={t('readingPlan.open')} onPress={() => void WebBrowser.openBrowserAsync(plan.reading!.url)} />
                {plan.reading.read ? (
                  <Text style={type.body}>{t('readingPlan.done')}</Text>
                ) : (
                  <Button variant="secondary" label={t('readingPlan.markRead')} onPress={() => api.markReadingRead(plan.id).then(setNow, fail)} />
                )}
                <Text style={type.small}>{t('readingPlan.readers', { count: plan.reading.readers })}</Text>
              </>
            ) : null}
            {plan.conversationId ? (
              <Button small variant="ghost" label={t('readingPlan.discuss')} onPress={() => router.push(`/conversation/${plan.conversationId}`)} />
            ) : null}
          </View>
        ) : null}

        {plans ? (
          <View style={styles.card}>
            <Text style={type.heading}>{t('readingPlan.staffTitle')}</Text>
            {plans.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={[type.body, styles.grow]}>
                  {p.title} · {t('readingPlan.planLine', { startsOn: p.startsOn, days: p.days, readers: p.readers })}
                  {p.archived ? ` · ${t('readingPlan.archived')}` : ''}
                </Text>
                {!p.archived ? <Button small variant="ghost" label={t('readingPlan.archive')} onPress={() => api.archiveReadingPlan(p.id).then(load, fail)} /> : null}
              </View>
            ))}
            <Field label={t('readingPlan.planTitle')} value={title} onChangeText={setTitle} maxLength={80} />
            <Field label={t('readingPlan.startsOn')} value={startsOn} onChangeText={setStartsOn} maxLength={10} />
            <Field label={t('readingPlan.references')} placeholder={'John 1\nJohn 2\nJohn 3'} value={refs} onChangeText={setRefs} multiline />
            <Button small label={t('readingPlan.create', { count: references.length })} disabled={!title.trim() || !references.length} onPress={create} />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  reference: { ...type.title },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
});
