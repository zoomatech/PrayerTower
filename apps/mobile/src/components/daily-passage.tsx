// The daily passage card and "Share a passage" (docs/LIBRARY_SEARCH.md). Both are off unless an admin turns them on
// under Admin → Bible Reference Text Search. A shared passage goes into a new post or prayer with its citation; the member edits it.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api, type LibraryDaily } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

/** The words a shared passage starts a post with: the passage in quotes, then where it is from. */
export function sharedPassage(text: string, citation: string) {
  return `“${text.trim()}”\n— ${citation}`.slice(0, 5000);
}

/** Opens a new post with the passage in it. */
export function sharePassage(text: string, citation: string) {
  router.push(`/compose?${new URLSearchParams({ body: sharedPassage(text, citation) })}`);
}

/** Today's passage at the top of the feed, the same all day for everyone in the community. */
export function DailyPassage() {
  const t = useT();
  const features = useFeatures();
  const [daily, setDaily] = useState<LibraryDaily | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!features.libraryDaily) return;
      api.libraryDaily().then(setDaily, () => undefined);
    }, [features.libraryDaily]),
  );
  if (!features.libraryDaily || !daily?.enabled || hidden === daily.day) return null;
  const p = daily.passage;
  return (
    <View style={styles.card} accessibilityLabel={t('library.dailyTitle')}>
      <Text style={type.small}>{t('library.dailyTitle')}</Text>
      <Text style={type.body} selectable>
        {p.text}
      </Text>
      <Text style={type.small}>{p.citation}</Text>
      <View style={styles.row}>
        {daily.share ? <Button small variant="secondary" label={t('library.share')} onPress={() => sharePassage(p.text, p.citation)} /> : null}
        <Button small variant="ghost" label={t('feed.notNow')} onPress={() => setHidden(daily.day)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
