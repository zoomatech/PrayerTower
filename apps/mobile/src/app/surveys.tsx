// Admin → Surveys: write a survey as a draft, open it to members, close it, and
// read the totals. An anonymous survey shows no results until enough people
// have answered (MIN_RESPONSES on the server).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api, type NewSurveyQuestion, type Survey, type SurveyResults } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

type Listed = Survey & { responses: number };
type QuestionDraft = { kind: NewSurveyQuestion['kind']; prompt: string; options: string; required: boolean };
const KINDS = ['single', 'multi', 'scale', 'text'] as const;
const blank = (): QuestionDraft => ({ kind: 'single', prompt: '', options: '', required: false });
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function questionsValid(qs: QuestionDraft[]) {
  return (
    qs.length > 0 &&
    qs.every((q) => {
      const n = lines(q.options).length;
      if (!q.prompt.trim()) return false;
      if (q.kind === 'single' || q.kind === 'multi') return n >= 2;
      if (q.kind === 'scale') return n === 0 || n === 2;
      return true;
    })
  );
}

function Surveys() {
  const { t } = useLocale();
  const [items, setItems] = useState<Listed[]>([]);
  const [title, setTitle] = useState('');
  const [intro, setIntro] = useState('');
  const [community, setCommunity] = useState('');
  const [anonymous, setAnonymous] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([blank()]);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems((await api.admin.surveys()).surveys);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>, done: string | null, after?: () => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      after?.();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = (i: number, patch: Partial<QuestionDraft>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const valid = title.trim().length > 0 && questionsValid(questions) && (!community.trim() || /^[a-z0-9-]{3,40}$/.test(community.trim()));

  const create = () =>
    run(
      () =>
        api.admin.createSurvey({
          title: title.trim(),
          intro: intro.trim() || null,
          anonymous,
          community: community.trim() || null,
          questions: questions.map((q) => ({ kind: q.kind, prompt: q.prompt.trim(), options: lines(q.options), required: q.required })),
        }),
      t('surveysAdmin.created'),
      () => {
        setTitle('');
        setIntro('');
        setCommunity('');
        setAnonymous(true);
        setQuestions([blank()]);
      },
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('surveysAdmin.title')}</Text>
        <Text style={type.body}>{t('surveysAdmin.intro')}</Text>
        <ErrorText error={error} />
        {notice ? <Text style={type.small}>{notice}</Text> : null}

        <Text style={type.heading}>{t('surveysAdmin.list')}</Text>
        {items.length === 0 && !error ? <Empty text={t('surveysAdmin.empty')} /> : null}
        {items.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={type.small}>
              {t(`surveysAdmin.status.${s.status}`)} · {t('surveysAdmin.responses', { count: s.responses })}
              {s.community ? ` · ${s.community}` : ''}
            </Text>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <View style={styles.row}>
              {s.status !== 'open' ? (
                <Button small variant="secondary" label={t('surveysAdmin.open', { title: s.title })} busy={busy} onPress={() => run(() => api.admin.setSurveyStatus(s.id, 'open'), null)} />
              ) : (
                <Button small variant="secondary" label={t('surveysAdmin.close', { title: s.title })} busy={busy} onPress={() => run(() => api.admin.setSurveyStatus(s.id, 'closed'), null)} />
              )}
              {results?.survey.id === s.id ? (
                <Button small variant="ghost" label={t('surveysAdmin.hide')} onPress={() => setResults(null)} />
              ) : (
                <Button small variant="ghost" label={t('surveysAdmin.results', { title: s.title })} onPress={() => run(async () => setResults(await api.admin.surveyResults(s.id)), null)} />
              )}
              {s.responses === 0 ? (
                <Button small variant="ghost" label={t('surveysAdmin.remove', { title: s.title })} busy={busy} onPress={() => run(() => api.admin.deleteSurvey(s.id), null)} />
              ) : null}
            </View>
            {results?.survey.id === s.id ? <ResultsView results={results} /> : null}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={type.heading}>{t('surveysAdmin.new')}</Text>
          <Field label={t('surveysAdmin.surveyTitle')} value={title} onChangeText={setTitle} maxLength={120} />
          <Field label={t('surveysAdmin.surveyIntro')} value={intro} onChangeText={setIntro} maxLength={1000} multiline />
          <Field label={t('surveysAdmin.community')} value={community} onChangeText={setCommunity} autoCapitalize="none" maxLength={40} />
          <Toggle label={t('surveysAdmin.anonymous')} hint={t('surveysAdmin.anonymousHint')} value={anonymous} onChange={setAnonymous} />
          {questions.map((q, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.cardTitle}>{t('surveysAdmin.question', { n: i + 1 })}</Text>
              <View style={styles.row}>
                {KINDS.map((k) => (
                  <Chip key={k} radio label={t(`surveysAdmin.kind.${k}`)} selected={q.kind === k} onPress={() => edit(i, { kind: k })} />
                ))}
              </View>
              <Field label={t('surveysAdmin.prompt')} value={q.prompt} onChangeText={(prompt) => edit(i, { prompt })} maxLength={300} />
              {q.kind !== 'text' ? (
                <Field label={t(q.kind === 'scale' ? 'surveysAdmin.scaleEnds' : 'surveysAdmin.options')} value={q.options} onChangeText={(options) => edit(i, { options })} multiline />
              ) : null}
              <Toggle label={t('surveysAdmin.mustAnswer')} value={q.required} onChange={(required) => edit(i, { required })} />
              {questions.length > 1 ? (
                <Button small variant="ghost" label={t('surveysAdmin.removeQuestion', { n: i + 1 })} onPress={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} />
              ) : null}
            </View>
          ))}
          {questions.length < 30 ? <Button small variant="secondary" label={t('surveysAdmin.addQuestion')} onPress={() => setQuestions((qs) => [...qs, blank()])} /> : null}
          <Button label={t('surveysAdmin.create')} onPress={create} busy={busy} disabled={!valid} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function ResultsView({ results }: { results: SurveyResults }) {
  const { t } = useLocale();
  if (!results.shown) return <Text style={type.small}>{t('surveysAdmin.tooFew')}</Text>;
  return (
    <View style={{ gap: space.sm }}>
      {results.questions.map((q) => (
        <View key={q.id} style={{ gap: 2 }}>
          <Text style={[type.body, { fontWeight: '600' }]}>{q.prompt}</Text>
          {q.counts
            ? Object.entries(q.counts).map(([k, n]) => (
                <Text key={k} style={type.small}>
                  {k}: {n}
                </Text>
              ))
            : null}
          {q.average != null ? <Text style={type.small}>{t('surveysAdmin.average', { value: q.average })}</Text> : null}
          {q.texts ? q.texts.length ? q.texts.map((x, i) => <Text key={i} style={type.small}>“{x}”</Text>) : <Text style={type.small}>{t('surveysAdmin.noTexts')}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  cardTitle: { ...type.body, fontWeight: '700' },
});

export default staffOnly(Surveys, ['admin']);
