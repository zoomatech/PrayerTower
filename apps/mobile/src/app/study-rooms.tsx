// Circle study rooms (docs/LIBRARY_SEARCH.md): a circle's studies (a passage or plan day and a question to open
// the talk), and one study's talk, where a reply can be answered one level deep. Only circle members see it; the
// kind cloud sits on every composer, and the author or the circle's starter can take a study or reply down.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { KindCloud } from '@/components/kind-cloud';
import { ListenPassage } from '@/components/listen-passage';
import { Button, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type LibraryStudy, type StudyReply, type StudyRoom } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function StudyRoomsScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ circle?: string; study?: string }>();
  const circleId = typeof params.circle === 'string' ? params.circle : null;
  const studyId = typeof params.study === 'string' ? params.study : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/circles'));
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={back} />
        {studyId ? <Room id={studyId} /> : circleId ? <List circleId={circleId} /> : <Text style={type.body}>{t('library.studyHow')}</Text>}
      </ScrollView>
    </Screen>
  );
}

function PassageCard({ s }: { s: LibraryStudy }) {
  const t = useT();
  return (
    <View style={[styles.card, styles.passage]}>
      {s.plan ? <Text style={type.small}>{t('library.studyPlanDay', { plan: s.plan.title, day: s.plan.day })}</Text> : null}
      <Text style={type.body} selectable>
        {s.passage.quote}
      </Text>
      <Text style={type.small}>{s.passage.citation}</Text>
    </View>
  );
}

function List({ circleId }: { circleId: string }) {
  const t = useT();
  const [data, setData] = useState<{ circle: { name: string }; studies: LibraryStudy[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.studies(circleId).then(
      (r) => (setData(r), setError(null)),
      (e) => setError((e as Error).message),
    );
  }, [circleId]);
  useFocusEffect(load);
  return (
    <>
      <Text style={type.title} accessibilityRole="header">
        {data ? t('library.studiesIn', { circle: data.circle.name }) : t('library.studies')}
      </Text>
      <ErrorText error={error} onRetry={load} />
      {!data && !error ? <Loading /> : null}
      {data ? <Text style={type.body}>{t('library.studyHow')}</Text> : null}
      {data && !data.studies.length ? <Empty text={t('library.studiesNone')} /> : null}
      {data?.studies.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={type.heading}>{s.passage.citation}</Text>
          <Text style={type.body}>{s.prompt}</Text>
          <Text style={type.small}>{t('library.studyBy', { name: s.author.displayName ?? t('library.studySomeone'), count: s.replies })}</Text>
          <Button small variant="secondary" label={t('library.studyOpen')} a11yLabel={t('library.studyOpenOne', { citation: s.passage.citation })} onPress={() => router.push(`/study-rooms?study=${s.id}`)} />
        </View>
      ))}
    </>
  );
}

function Room({ id }: { id: string }) {
  const t = useT();
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [answering, setAnswering] = useState<StudyReply | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.study(id).then(
      (r) => (setRoom(r), setError(null)),
      (e) => setError((e as Error).message),
    );
  }, [id]);
  useFocusEffect(load);

  const send = () => {
    setBusy(true);
    return api
      .studyReply(id, draft.trim(), answering?.id)
      .then(
        () => {
          setDraft('');
          setAnswering(null);
          load();
        },
        (e) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };
  const takeDown = (replyId: string) => api.removeStudyReply(replyId).then(load, (e) => setError((e as Error).message));

  const reply = (r: StudyReply, answer = false) => (
    <View key={r.id} style={[styles.reply, answer ? styles.answer : null]}>
      <Text style={type.small}>{r.author.displayName ?? t('library.studySomeone')}</Text>
      <Text style={type.body}>{r.body}</Text>
      <View style={styles.row}>
        <Button small variant="ghost" label={t('library.studyAnswer')} a11yLabel={t('library.studyAnswerOne', { name: r.author.displayName ?? t('library.studySomeone') })} onPress={() => setAnswering(r)} />
        {r.canRemove ? <Button small variant="ghost" label={t('library.studyTakeDown')} onPress={() => takeDown(r.id)} /> : null}
      </View>
    </View>
  );

  if (!room) return error ? <ErrorText error={error} onRetry={load} /> : <Loading />;
  const s = room.study;
  return (
    <>
      <Text style={type.title} accessibilityRole="header">
        {s.passage.citation}
      </Text>
      <ErrorText error={error} onRetry={load} />
      <PassageCard s={s} />
      <ListenPassage collection={s.passage.collection} passageKey={s.passage.key} text={s.passage.quote} citation={s.passage.citation} />
      <View style={styles.card}>
        <Text style={type.small}>{s.author.displayName ?? t('library.studySomeone')}</Text>
        <Text style={type.body}>{s.prompt}</Text>
        {s.canRemove ? (
          <Button small variant="ghost" label={t('library.studyRemove')} onPress={() => api.removeStudy(s.id).then(() => (router.canGoBack() ? router.back() : router.replace('/circles')), (e) => setError((e as Error).message))} />
        ) : null}
      </View>
      {!room.replies.length ? <Empty text={t('library.studyQuiet')} /> : null}
      {room.replies.map((r) => (
        <View key={r.id} style={styles.thread}>
          {reply(r)}
          {r.answers.map((a) => reply(a, true))}
        </View>
      ))}
      <View style={styles.card}>
        {answering ? (
          <View style={styles.row}>
            <Text style={type.small}>{t('library.studyAnswering', { name: answering.author.displayName ?? t('library.studySomeone') })}</Text>
            <Button small variant="ghost" label={t('common.cancel')} onPress={() => setAnswering(null)} />
          </View>
        ) : null}
        <Field label={t('library.studyReply')} value={draft} onChangeText={setDraft} maxLength={1000} multiline />
        <KindCloud text={draft} />
        <Button small label={t('library.studySend')} busy={busy} disabled={busy || !draft.trim()} onPress={send} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  passage: { backgroundColor: colors.primarySoft },
  thread: { gap: space.xs },
  reply: { gap: space.xs, padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  answer: { marginLeft: space.xl },
});
