// My highlights and notes (docs/LIBRARY_SEARCH.md): every passage the member has marked, newest first, private
// unless they shared the note with a circle; and the notes shared in each of their circles.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { noteFill, PassageMark } from '@/components/passage-mark';
import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type CircleLibraryNote, type LibraryNote } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function MyNotesScreen() {
  const t = useT();
  const features = useFeatures();
  const params = useLocalSearchParams<{ circle?: string }>();
  const circleId = typeof params.circle === 'string' ? params.circle : null;
  const [notes, setNotes] = useState<LibraryNote[] | null>(null);
  const [shared, setShared] = useState<CircleLibraryNote[] | null>(null);
  const [circles, setCircles] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    const fail = (e: unknown) => setError((e as Error).message);
    if (circleId) api.circleLibraryNotes(circleId).then((r) => setShared(r.notes), fail);
    else api.libraryNotes().then((r) => setNotes(r.notes), fail);
    if (features.prayerCircles) api.myCircles().then((r) => setCircles(r.circles.map((c) => ({ id: c.id, name: c.name }))), () => undefined);
  }, [circleId, features.prayerCircles]);
  useFocusEffect(load);

  const saved = (key: string, note: LibraryNote | null) => setNotes((list) => (list ?? []).flatMap((n) => (n.key !== key ? [n] : note ? [note] : [])));
  const circleName = circles.find((c) => c.id === circleId)?.name ?? '';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={back} />
        <Text style={type.title} accessibilityRole="header">
          {circleId ? t('library.notesInCircle', { circle: circleName }) : t('library.notesTitle')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : null}
        {circleId ? (
          shared === null ? (
            error ? null : <Loading />
          ) : (
            <>
              {shared.length === 0 ? <Text style={type.body}>{t('library.notesCircleNone')}</Text> : null}
              {shared.map((n) => (
                <View key={n.id} style={[styles.card, n.color ? { backgroundColor: noteFill[n.color] } : null]}>
                  <Text style={type.small}>{n.mine ? t('library.notesYou') : n.author}</Text>
                  <Text style={type.body}>{n.note}</Text>
                  <Text style={[type.body, styles.quote]}>“{n.quote}”</Text>
                  <Text style={type.small}>{n.citation}</Text>
                </View>
              ))}
            </>
          )
        ) : notes === null ? (
          error ? null : <Loading />
        ) : (
          <>
            <Text style={type.body}>{t('library.notesIntro')}</Text>
            {circles.length ? (
              <View style={styles.row}>
                {circles.map((c) => (
                  <Button key={c.id} small variant="secondary" label={t('library.notesInCircle', { circle: c.name })} onPress={() => router.push(`/my-notes?circle=${c.id}`)} />
                ))}
              </View>
            ) : null}
            {notes.length === 0 ? <Text style={type.body}>{t('library.notesNone')}</Text> : null}
            {notes.map((n) => (
              <View key={n.id} style={[styles.card, n.color ? { backgroundColor: noteFill[n.color] } : null]}>
                <Text style={type.heading}>{n.citation}</Text>
                <Text style={type.body} selectable>
                  {n.quote}
                </Text>
                <PassageMark collection={n.collection} passageKey={n.key} citation={n.citation} mark={n} circles={circles} onSaved={saved} />
                {n.collection === 'bible-kjv' && features.libraryWords ? (
                  <Button small variant="ghost" label={t('library.study.study')} a11yLabel={t('library.study.studyOne', { ref: n.ref })} onPress={() => router.push(`/word-study?ref=${encodeURIComponent(n.ref)}`)} />
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
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  quote: { fontStyle: 'italic' },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
