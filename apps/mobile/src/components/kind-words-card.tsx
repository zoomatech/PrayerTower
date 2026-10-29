// Kind words practice (docs/GROWTH_PRACTICES.md): a private weekly card on Me with a short,
// made-up moment and three replies. Tapping one shows gently how it might land, so members can
// practise empathy without risk to anyone (Steve's notes: "promote empathy, with content,
// interaction, games"). No scores, no streaks, and nothing tapped leaves the phone.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export const KIND_WORDS_MOMENTS = 6;

/** The same moment all week, a new one each Monday (UTC). */
export function momentFor(now: Date) {
  const monday = Math.floor((now.getTime() / 86_400_000 + 3) / 7);
  return ((monday % KIND_WORDS_MOMENTS) + KIND_WORDS_MOMENTS) % KIND_WORDS_MOMENTS;
}

export function KindWordsCard({ now = new Date() }: { now?: Date }) {
  const { empathyPractice } = useFeatures();
  const t = useT();
  const [picked, setPicked] = useState<number | null>(null);
  if (!empathyPractice) return null;
  const s = `kindWords.s${momentFor(now)}`;
  return (
    <View style={styles.card} testID="kind-words-card">
      <Text style={type.heading} role="heading">
        {t('kindWords.title')}
      </Text>
      <Text style={type.small}>{t('kindWords.intro')}</Text>
      <Text style={type.body}>{t(`${s}.situation`)}</Text>
      <View style={styles.row} role="radiogroup" aria-label={t('kindWords.pick')}>
        {[0, 1, 2].map((i) => (
          <Chip key={i} radio label={t(`${s}.r${i}`)} selected={picked === i} onPress={() => setPicked(i)} />
        ))}
      </View>
      {picked !== null ? (
        <Text style={type.small} testID="kind-words-note" aria-live="polite">
          {t(`${s}.n${picked}`)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { gap: space.sm, alignItems: 'flex-start' },
});
