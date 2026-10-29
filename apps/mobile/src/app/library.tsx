// Scripture and ancient writings search (docs/LIBRARY_SEARCH.md), ported from Winstons Syndicate. Off unless an
// admin turns it on. The server offers the King James Bible to faith communities and the public-domain ancient
// writings to everyone; members type words and get passages, best first.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { sharePassage } from '@/components/daily-passage';
import { Button, Chip, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type LibraryCollectionId, type LibraryHit, type LibraryOverview } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const PAGE = 20;

export default function LibraryScreen() {
  const t = useT();
  const features = useFeatures();
  const [overview, setOverview] = useState<LibraryOverview | null>(null);
  const [collection, setCollection] = useState<LibraryCollectionId | null>(null);
  const [words, setWords] = useState('');
  const [searched, setSearched] = useState('');
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.resolve()
      .then(() => api.library())
      .then(
        (o) => {
          setOverview(o);
          if (o.enabled) setCollection((c) => (c && o.collections.some((x) => x.id === c) ? c : (o.collections[0]?.id ?? null)));
        },
        (e) => setError((e as Error).message),
      );
  }, []);
  useFocusEffect(load);

  const run = (offset: number, q = searched, from = collection) => {
    if (!from || !q.trim()) return;
    setBusy(true);
    setError(null);
    api
      .searchLibrary({ q: q.trim(), collection: from, offset, limit: PAGE })
      .then(
        (r) => {
          setSearched(q);
          setTotal(r.total);
          setSource(r.source);
          setHits((h) => (offset ? [...(h ?? []), ...r.hits] : r.hits));
        },
        (e) => setError((e as Error).message),
      )
      .finally(() => setBusy(false));
  };
  const choose = (id: LibraryCollectionId) => {
    setCollection(id);
    setHits(null);
    if (searched) run(0, searched, id);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} accessibilityRole="header">
          {t('library.title')}
        </Text>
        {error ? <ErrorText error={error} onRetry={overview ? () => run(0, words) : load} /> : overview === null ? <Loading /> : null}
        {overview && !overview.enabled ? <Text style={type.body}>{t('library.closed')}</Text> : null}
        {overview?.enabled ? (
          <>
            {overview.collections.length > 1 ? (
              <View style={styles.row} role="radiogroup">
                {overview.collections.map((c) => (
                  <Chip key={c.id} radio label={c.title} selected={collection === c.id} onPress={() => choose(c.id)} />
                ))}
              </View>
            ) : null}
            <Field
              label={t('library.words')}
              placeholder={t('library.placeholder')}
              value={words}
              onChangeText={setWords}
              maxLength={200}
              returnKeyType="search"
              onSubmitEditing={() => run(0, words)}
            />
            <Button label={t('library.search')} disabled={!words.trim() || busy} onPress={() => run(0, words)} />
          </>
        ) : null}
        {hits ? <Text style={type.small}>{hits.length ? t('library.results', { count: total }) : t('library.none')}</Text> : null}
        {hits?.map((h, i) => (
          <View key={`${h.work.id}:${h.ref}:${i}`} style={styles.card}>
            <Text style={type.heading}>{collection === 'bible-kjv' ? h.ref : h.work.title}</Text>
            {collection !== 'bible-kjv' && h.ref ? <Text style={type.small}>{h.ref}</Text> : null}
            <Text style={type.body} selectable>
              {h.text}
            </Text>
            {!h.complete ? <Text style={type.small}>{t('library.near')}</Text> : null}
            {features.libraryShare ? (
              <Button small variant="secondary" label={t('library.share')} a11yLabel={t('library.shareOne', { citation: h.citation })} onPress={() => sharePassage(h.text, h.citation)} />
            ) : null}
          </View>
        ))}
        {hits && hits.length < total ? <Button small variant="secondary" label={t('library.more')} disabled={busy} onPress={() => run(hits.length)} /> : null}
        {busy ? <Loading /> : null}
        {hits?.length ? <Text style={type.small}>{t('library.source', { source })}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
