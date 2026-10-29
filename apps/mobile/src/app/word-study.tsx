// Word study (docs/LIBRARY_SEARCH.md): a King James verse word by word; tapping a word shows its Hebrew or Greek
// root from Strong's public-domain dictionaries (1890, 1894), what it means, and other verses that use it. Off
// unless an admin turns it on; offered only where the King James Bible is.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type WordEntry, type WordVerse } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const PAGE = 20;

export default function WordStudyScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ ref?: string; id?: string }>();
  const ref = typeof params.ref === 'string' ? params.ref : null;
  const id = typeof params.id === 'string' ? params.id : null;
  const [verse, setVerse] = useState<WordVerse | null>(null);
  const [entry, setEntry] = useState<WordEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    if (id) api.wordEntry(id, 0, PAGE).then(setEntry, (e) => setError((e as Error).message));
    else if (ref) api.wordVerse(ref).then(setVerse, (e) => setError((e as Error).message));
  }, [id, ref]);
  useFocusEffect(load);

  const more = () => {
    if (!entry) return;
    setBusy(true);
    api
      .wordEntry(entry.id, entry.verses.length, PAGE)
      .then(
        (r) => setEntry({ ...r, verses: [...entry.verses, ...r.verses] }),
        (e) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace('/library'));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={back} />
        <Text style={type.title} accessibilityRole="header">
          {id && entry ? `${entry.lemma} · ${entry.translit}` : verse ? verse.citation : t('library.study.title')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : null}
        {!id && !ref ? <Text style={type.body}>{t('library.study.how')}</Text> : null}
        {ref && !id ? (
          verse === null ? (
            error ? null : <Loading />
          ) : (
            <>
              <Text style={type.body}>{t('library.study.tap')}</Text>
              <View style={styles.words}>
                {verse.words.map((w, i) =>
                  w.strongs.length ? (
                    <Pressable
                      key={i}
                      role="button"
                      accessibilityLabel={t('library.study.wordOne', { word: w.text, roots: w.strongs.map((n) => `${verse.roots[n]?.translit ?? ''} (${n})`).join(', ') })}
                      onPress={() => router.push(`/word-study?id=${w.strongs[0]}`)}
                      style={styles.word}
                    >
                      <Text style={[type.body, styles.wordText]}>{w.text}</Text>
                      <Text style={type.small}>{w.strongs.map((n) => verse.roots[n]?.translit || n).join(' · ')}</Text>
                    </Pressable>
                  ) : (
                    <Text key={i} style={[type.body, styles.plain]}>
                      {w.text}
                    </Text>
                  ),
                )}
              </View>
              <Text style={type.small}>{t('library.study.source')}</Text>
            </>
          )
        ) : null}
        {id ? (
          entry === null ? (
            error ? null : <Loading />
          ) : (
            <>
              <Text style={type.small}>{t('library.study.number', { language: t(`library.study.${entry.language === 'Hebrew' ? 'hebrew' : 'greek'}`), id: entry.id, pron: entry.pron })}</Text>
              <View style={styles.card}>
                <Text style={type.heading}>{t('library.study.meaning')}</Text>
                <Text style={type.body} selectable>
                  {entry.definition}
                </Text>
                {entry.derivation ? <Text style={type.small}>{entry.derivation}</Text> : null}
                {entry.kjv ? <Text style={type.small}>{t('library.study.kjv', { words: entry.kjv })}</Text> : null}
              </View>
              <Text style={type.heading}>{t('library.study.uses', { count: entry.total })}</Text>
              {entry.verses.map((v) => (
                <View key={v.ref} style={styles.card}>
                  <Text style={type.heading}>{v.ref}</Text>
                  <Text style={type.body} selectable>
                    {v.text}
                  </Text>
                  {v.as.length ? <Text style={type.small}>{t('library.study.as', { words: [...new Set(v.as)].join(', ') })}</Text> : null}
                  <Button small variant="ghost" label={t('library.study.study')} a11yLabel={t('library.study.studyOne', { ref: v.ref })} onPress={() => router.push(`/word-study?ref=${encodeURIComponent(v.ref)}`)} />
                </View>
              ))}
              {entry.verses.length < entry.total ? <Button small variant="secondary" label={t('library.more')} disabled={busy} onPress={more} /> : null}
              <Text style={type.small}>{t('library.study.source')}</Text>
            </>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  words: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', rowGap: space.sm },
  word: { paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.primarySoft, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  wordText: { color: colors.primary, fontWeight: '600' },
  plain: { paddingVertical: 2, minHeight: 44, textAlignVertical: 'center' },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
