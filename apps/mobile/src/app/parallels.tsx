// Parallels (docs/LIBRARY_SEARCH.md): related passages from different texts side by side, from a curated list
// with citations: the flood in Genesis and Gilgamesh, creation, Moses beside Hammurabi. Off unless an admin turns
// it on; Open Circle sees them without the Bible. On a wide screen the sides sit in columns; on a phone they
// scroll sideways, one card per text.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { sharePassage } from '@/components/daily-passage';
import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type ParallelTheme, type ParallelThemes } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function ParallelsScreen() {
  const t = useT();
  const features = useFeatures();
  const params = useLocalSearchParams<{ theme?: string }>();
  const { width } = useWindowDimensions();
  const [list, setList] = useState<ParallelThemes | null>(null);
  const [theme, setTheme] = useState<ParallelTheme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = typeof params.theme === 'string' ? params.theme : null;

  const load = useCallback(() => {
    setError(null);
    const call = open ? api.parallel(open).then((r) => setTheme(r)) : api.parallels().then((r) => setList(r));
    call.catch((e) => setError((e as Error).message));
  }, [open]);
  useFocusEffect(load);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  // Side cards: columns when there is room, otherwise a sideways row.
  const wide = width >= 900;
  const cardWidth = Math.min(360, Math.max(260, width * 0.82));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={back} />
        <Text style={type.title} accessibilityRole="header">
          {open && theme ? theme.title : t('library.parallels')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : null}
        {!open ? (
          list === null ? (
            error ? null : <Loading />
          ) : !list.enabled ? (
            <Text style={type.body}>{t('library.parallelsOff')}</Text>
          ) : (
            <>
              <Text style={type.body}>{t('library.parallelsIntro')}</Text>
              {list.themes.length === 0 ? <Text style={type.body}>{t('library.parallelsNone')}</Text> : null}
              {list.themes.map((th) => (
                <View key={th.id} style={styles.card}>
                  <Text style={type.heading}>{th.title}</Text>
                  <Text style={type.body}>{th.intro}</Text>
                  <Text style={type.small}>{th.texts.join(' · ')}</Text>
                  <Button small variant="secondary" label={t('library.parallelsOpen')} a11yLabel={`${t('library.parallelsOpen')}: ${th.title}`} onPress={() => router.push(`/parallels?theme=${th.id}`)} />
                </View>
              ))}
            </>
          )
        ) : theme === null ? (
          error ? null : <Loading />
        ) : (
          <>
            <Text style={type.body}>{theme.intro}</Text>
            <Text style={type.small}>{t('library.parallelsCount', { count: theme.sides.length })}</Text>
            <ScrollView horizontal={!wide} contentContainerStyle={wide ? styles.columns : styles.row}>
              {theme.sides.map((s, i) => (
                <View key={`${s.collection}:${s.ref}:${i}`} style={[styles.card, styles.side, wide ? styles.column : { width: cardWidth }]}>
                  <Text style={type.small}>{s.collectionTitle}</Text>
                  {s.label ? <Text style={type.heading}>{s.label}</Text> : null}
                  <Text style={type.body} selectable>
                    {s.text}
                  </Text>
                  <Text style={type.small}>{s.citation}</Text>
                  {features.libraryShare ? (
                    <Button small variant="ghost" label={t('library.share')} a11yLabel={t('library.shareOne', { citation: s.citation })} onPress={() => sharePassage(s.text, s.citation)} />
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { gap: space.md, paddingRight: space.lg },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  column: { flexBasis: 320, flexGrow: 1 },
  side: { alignSelf: 'flex-start' },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
