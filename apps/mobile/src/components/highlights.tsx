// Highlights ("right column"): this week's most-prayed requests and top
// prayer warriors. Shown beside the feed on wide screens, and on its own
// screen on phones.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { type Highlights as Data } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export function Highlights({ data }: { data: Data | null }) {
  const { t } = useLocale();
  const features = useFeatures();
  if (!data) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <Text style={type.heading}>{t('highlights.mostPrayed')}</Text>
        {data.topPrayers.length === 0 ? <Text style={type.small}>{t('highlights.none')}</Text> : null}
        {data.topPrayers.map((p, i) => (
          <Text key={p.card.id} style={type.body} onPress={() => router.push(`/post/${p.card.id}`)} accessibilityRole="link">
            <Text style={styles.rank}>{i + 1}. </Text>
            {p.card.preview}
            <Text style={type.small}>
              {'  '}
              {t('card.praying', { count: p.prayers })}
            </Text>
          </Text>
        ))}
      </View>
      <View style={styles.box}>
        <Text style={type.heading}>{t('highlights.warriors')}</Text>
        {data.topWarriors.length === 0 ? <Text style={type.small}>{t('highlights.beFirst')}</Text> : null}
        {data.topWarriors.map((w, i) => (
          <View key={`${w.id ?? 'anon'}-${i}`} style={styles.warrior}>
            <Text style={[type.body, styles.name]} onPress={w.id ? () => router.push(`/people/${w.id}`) : undefined}>
              {i + 1}. {w.displayName}
            </Text>
            <Text style={type.small}>{w.prayers}</Text>
          </View>
        ))}
        <Text style={type.small}>{t('highlights.window', { count: data.days })}</Text>
      </View>
      {features.witnessStories ? (
        <Text style={styles.link} onPress={() => router.push('/help-stories')} accessibilityRole="link">
          {t('helpStories.link')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  box: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  rank: { fontWeight: '700', color: colors.primary },
  warrior: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1 },
  link: { ...type.body, color: colors.primary, fontWeight: '600' },
});
