// Gentle onboarding for the kindness tools: up to three short cards at the top of the
// feed (the kind cloud, emoji meanings, lament), one at a time. Only the tools that are
// on get a card. Shown once per member on this device, until they finish or skip.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export const introKey = (userId: string) => `kindness-intro:seen:v1:${userId}`;

export function KindnessIntro() {
  const f = useFeatures();
  const t = useT();
  const { profile } = useAuth();
  const [seen, setSeen] = useState(true);
  const [step, setStep] = useState(0);
  const id = profile?.id;

  useEffect(() => {
    if (!f.kindnessIntro || !id) return;
    let live = true;
    AsyncStorage.getItem(introKey(id))
      .then((v) => live && setSeen(v === '1'))
      .catch(() => undefined); // No storage: don't show it.
    return () => {
      live = false;
    };
  }, [f.kindnessIntro, id]);

  const cards = [f.kindCloud && 'cloud', f.meaningReactions && 'meanings', f.lament && 'lament'].filter((c): c is string => !!c);
  if (!f.kindnessIntro || !id || seen || !cards.length) return null;

  const done = () => {
    setSeen(true);
    AsyncStorage.setItem(introKey(id), '1').catch(() => undefined);
  };
  const key = cards[Math.min(step, cards.length - 1)]!;
  const last = step >= cards.length - 1;

  return (
    <View style={styles.card} testID="kindness-intro" accessibilityRole="summary">
      <Text style={type.small}>{t('kindIntro.step', { n: step + 1, total: cards.length })}</Text>
      <Text style={type.heading} accessibilityRole="header">
        {t(`kindIntro.${key}Title`)}
      </Text>
      <Text style={type.body}>{t(`kindIntro.${key}Body`)}</Text>
      <View style={styles.row}>
        {step > 0 ? <Button small variant="ghost" label={t('kindIntro.back')} onPress={() => setStep(step - 1)} /> : null}
        <Button small label={last ? t('kindIntro.done') : t('kindIntro.next')} onPress={last ? done : () => setStep(step + 1)} />
        {!last ? <Button small variant="ghost" label={t('kindIntro.skip')} onPress={done} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
