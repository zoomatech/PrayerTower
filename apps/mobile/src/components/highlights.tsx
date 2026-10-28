// Highlights ("right column"): this week's most-prayed requests and top
// prayer warriors. Shown beside the feed on wide screens, and on its own
// screen on phones.
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { type Highlights as Data } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export function Highlights({ data }: { data: Data | null }) {
  if (!data) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.box}>
        <Text style={type.heading}>Most prayed this week</Text>
        {data.topPrayers.length === 0 ? <Text style={type.small}>No prayers yet this week.</Text> : null}
        {data.topPrayers.map((t, i) => (
          <Text key={t.card.id} style={type.body} onPress={() => router.push(`/post/${t.card.id}`)} accessibilityRole="link">
            <Text style={styles.rank}>{i + 1}. </Text>
            {t.card.preview}
            <Text style={type.small}>
              {'  '}
              {t.prayers} praying
            </Text>
          </Text>
        ))}
      </View>
      <View style={styles.box}>
        <Text style={type.heading}>Top prayer warriors</Text>
        {data.topWarriors.length === 0 ? <Text style={type.small}>Be the first to pray this week.</Text> : null}
        {data.topWarriors.map((w, i) => (
          <View key={`${w.id ?? 'anon'}-${i}`} style={styles.warrior}>
            <Text style={[type.body, styles.name]} onPress={w.id ? () => router.push(`/people/${w.id}`) : undefined}>
              {i + 1}. {w.displayName}
            </Text>
            <Text style={type.small}>{w.prayers}</Text>
          </View>
        ))}
        <Text style={type.small}>Prayers for others in the last {data.days} days.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  box: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  rank: { fontWeight: '700', color: colors.primary },
  warrior: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  name: { flex: 1 },
});
