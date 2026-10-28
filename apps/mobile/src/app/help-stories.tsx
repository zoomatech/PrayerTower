// Stories of help (Business Plan 7, "testimony engine"): what the Witness team
// did, shared only after the person helped approved the exact words, never
// with their name. People asked about a story approve or decline it here, and
// can take an approval back.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

type Mine = Awaited<ReturnType<typeof api.myWitnessStories>>['stories'];
type Shown = Awaited<ReturnType<typeof api.helpStories>>;

export default function HelpStories() {
  const { t } = useLocale();
  const [mine, setMine] = useState<Mine>([]);
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.myWitnessStories().then((r) => setMine(r.stories), (e) => setError((e as Error).message));
    api.helpStories().then((r) => (setShown(r), setError(null)), (e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  const decide = (id: string, approve: boolean) => api.decideWitnessStory(id, approve).then(load, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('helpStories.title')}</Text>
        <ErrorText error={error} onRetry={shown ? undefined : load} />
        {!shown && !error ? <Loading /> : null}

        {mine.length ? (
          <View style={styles.card}>
            <Text style={type.heading}>{t('helpStories.aboutYou')}</Text>
            <Text style={type.small}>{t('helpStories.aboutYouHint')}</Text>
            {mine.map((s) => (
              <View key={s.id} style={styles.item}>
                <Text style={type.body}>{s.body}</Text>
                <Text style={type.small}>{t(`helpStories.status.${s.status}`)}</Text>
                <View style={styles.row}>
                  {s.status === 'awaiting_consent' ? <Button small label={t('helpStories.approve')} onPress={() => decide(s.id, true)} /> : null}
                  {s.status !== 'declined' ? (
                    <Button small variant="secondary" label={s.status === 'approved' ? t('helpStories.takeBack') : t('helpStories.decline')} onPress={() => decide(s.id, false)} />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {shown?.enabled ? (
          <>
            <Text style={type.body}>{t('helpStories.intro')}</Text>
            {shown.stories.length === 0 ? <Empty text={t('helpStories.none')} /> : null}
            {shown.stories.map((s) => (
              <View key={s.id} style={styles.card}>
                <Text style={type.body}>{s.body}</Text>
              </View>
            ))}
          </>
        ) : shown && !mine.length ? (
          <Empty text={t('helpStories.off')} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  item: { gap: space.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
