// The Hall of Prayer Warriors: each year's award winners. Names appear only when
// the winner chose to show them.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, Screen } from '@/components/ui';
import { api, type AwardHall } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export default function Awards() {
  const { t } = useLocale();
  const [hall, setHall] = useState<AwardHall | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.awardHall().then(setHall).catch(() => setHall({ enabled: false, years: [] }));
    }, []),
  );
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={type.title}>{t('award.hall')}</Text>
        <Text style={type.body}>{t('award.hallIntro')}</Text>
        {hall && !hall.years.length ? <Empty text={t('award.none')} /> : null}
        {hall?.years.map((y) => (
          <View key={y.year} style={styles.year}>
            <Text style={type.heading}>{y.year}</Text>
            {y.winners.map((w) => (
              <Text key={w.rank} style={type.body}>
                {w.rank}. {w.name ?? t('award.anonymous')} · {t('award.line', { count: w.prayers, people: w.peoplePrayedFor })}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  year: { gap: space.xs },
});
