// Open surveys (Admin → Surveys) the member hasn't answered, at the top of the
// feed under the announcements. Nothing shows until an admin opens a survey.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api, type Survey } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export function SurveyPrompts() {
  const { t } = useLocale();
  const [items, setItems] = useState<Survey[]>([]);

  useFocusEffect(
    useCallback(() => {
      // Offline or failing: show nothing rather than an error over the feed.
      api.surveys().then((r) => setItems(r.surveys), () => undefined);
    }, []),
  );

  if (!items.length) return null;
  return (
    <View style={{ gap: space.sm }} role="region" aria-label={t('surveys.label')}>
      {items.map((s) => (
        <View key={s.id} style={styles.box}>
          <Text style={type.heading}>{t('surveys.prompt', { title: s.title })}</Text>
          {s.intro ? <Text style={type.body}>{s.intro}</Text> : null}
          <Button small variant="secondary" label={t('surveys.take')} onPress={() => router.push(`/survey/${s.id}`)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary, padding: space.md },
});
