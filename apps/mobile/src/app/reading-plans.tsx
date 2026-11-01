// Reading plans from the library (docs/LIBRARY_SEARCH.md): curated plans read a little each day at the member's
// own pace (the next day is the first one not read; nothing is ever "behind"), alone or with one of their
// circles, with an optional evening reminder. Off unless an admin turns it on; Open Circle gets the plans with
// no Bible in them. Separate from the staff-set Bible reading plan (reading-plan.tsx).
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { sharePassage } from '@/components/daily-passage';
import { ListenPassage } from '@/components/listen-passage';
import { PassageMark, useLibraryNotes } from '@/components/passage-mark';
import { StudyStart } from '@/components/study-start';
import { Button, ErrorText, Loading, Screen, Toggle } from '@/components/ui';
import { api, type ReadingPlan, type ReadingPlanDay, type ReadingPlans } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function ReadingPlansScreen() {
  const params = useLocalSearchParams<{ plan?: string; day?: string }>();
  const plan = typeof params.plan === 'string' ? params.plan : null;
  const day = Number(params.day);
  return plan && day >= 1 ? <PlanDay plan={plan} day={day} /> : <PlanList />;
}

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

function PlanList() {
  const t = useT();
  const [plans, setPlans] = useState<ReadingPlans | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    Promise.resolve()
      .then(() => api.readingPlans())
      .then(setPlans, (e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);
  const act = (call: Promise<ReadingPlans>) =>
    call.then(setPlans, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={back} />
        <Text style={type.title} accessibilityRole="header">
          {t('library.plans')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : plans === null ? <Loading /> : null}
        {plans && !plans.enabled ? <Text style={type.body}>{t('library.plansOff')}</Text> : null}
        {plans?.enabled ? (
          <>
            <Text style={type.body}>{t('library.plansIntro')}</Text>
            {plans.plans.map((p) => (
              <PlanCard key={p.id} plan={p} circles={plans.circles} onAct={act} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PlanCard({ plan: p, circles, onAct }: { plan: ReadingPlan; circles: { id: string; name: string }[]; onAct: (call: Promise<ReadingPlans>) => unknown }) {
  const t = useT();
  const f = p.following;
  return (
    <View style={styles.card}>
      <Text style={type.heading}>{p.title}</Text>
      <Text style={type.body}>{p.intro}</Text>
      <Text style={type.small}>{t('library.planDays', { count: p.days })}</Text>
      {p.circles.map((c) => (
        <Text key={c.id} style={type.small}>
          {t('library.planCircleReading', { circle: c.name, count: c.readers })}
        </Text>
      ))}
      {f ? (
        <>
          <Text style={type.body}>{f.finished ? t('library.planFinished') : t('library.planProgress', { read: f.read, days: p.days })}</Text>
          {f.next ? <Button small label={t('library.planOpenDay', { day: f.next })} onPress={() => router.push(`/reading-plans?plan=${p.id}&day=${f.next}`)} /> : null}
          <Toggle label={t('library.planReminders')} hint={t('library.planRemindersHint')} value={f.reminders} onChange={(reminders) => onAct(api.followPlan(p.id, { reminders }))} />
          <Button small variant="ghost" label={t('library.planStop')} onPress={() => onAct(api.unfollowPlan(p.id))} />
        </>
      ) : (
        <View style={styles.row}>
          <Button small label={t('library.planFollow')} onPress={() => onAct(api.followPlan(p.id))} />
          {circles.map((c) => (
            <Button key={c.id} small variant="secondary" label={t('library.planFollowWith', { circle: c.name })} onPress={() => onAct(api.followPlan(p.id, { circleId: c.id }))} />
          ))}
        </View>
      )}
    </View>
  );
}

function PlanDay({ plan, day }: { plan: string; day: number }) {
  const t = useT();
  const features = useFeatures();
  const notes = useLibraryNotes();
  const [data, setData] = useState<ReadingPlanDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    setData(null);
    Promise.resolve()
      .then(() => api.planDay(plan, day))
      .then(setData, (e) => setError((e as Error).message));
  }, [plan, day]);
  useFocusEffect(load);
  const go = (n: number) => router.replace(`/reading-plans?plan=${plan}&day=${n}`);
  const markRead = () =>
    api.readPlanDay(plan, day).then(setData, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={back} />
        {error ? <ErrorText error={error} onRetry={load} /> : data === null ? <Loading /> : null}
        {data ? (
          <>
            <Text style={type.title} accessibilityRole="header">
              {data.plan.title}
            </Text>
            <Text style={type.small}>{t('library.planDayOf', { day: data.day, days: data.plan.days })}</Text>
            <Text style={type.heading}>{data.reading.citation}</Text>
            <Text style={type.body} selectable>
              {data.reading.text}
            </Text>
            {data.circle ? <Text style={type.small}>{t('library.planCircleToday', { circle: data.circle.name, readers: data.circle.readers, reading: data.circle.reading })}</Text> : null}
            {data.following ? (
              data.read ? (
                <Text style={type.body}>✓ {t('library.planRead')}</Text>
              ) : (
                <Button label={t('library.planMarkRead')} onPress={markRead} />
              )
            ) : null}
            {features.libraryShare ? (
              <Button small variant="ghost" label={t('library.share')} a11yLabel={t('library.shareOne', { citation: data.reading.citation })} onPress={() => sharePassage(data.reading.text.slice(0, 1500), data.reading.citation)} />
            ) : null}
            <ListenPassage collection={data.reading.collection} passageKey={data.reading.key} text={data.reading.text} citation={data.reading.citation} />
            <StudyStart of={{ planId: plan, day }} citation={data.reading.citation} />
            {notes.enabled ? <PassageMark collection={data.reading.collection} passageKey={data.reading.key} citation={data.reading.citation} mark={notes.marks[data.reading.key]} circles={notes.circles} onSaved={notes.saved} /> : null}
            <View style={styles.row}>
              {data.day > 1 ? <Button small variant="secondary" label={t('library.planPrevious')} onPress={() => go(data.day - 1)} /> : null}
              {data.day < data.plan.days ? <Button small variant="secondary" label={t('library.planNext')} onPress={() => go(data.day + 1)} /> : null}
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
