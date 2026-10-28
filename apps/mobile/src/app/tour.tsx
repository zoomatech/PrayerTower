// First-run tour: five short cards on how Prayer Tower works. Shown once per
// member on this device after onboarding, and any time from Me → How Prayer
// Tower works.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { markTourSeen } from '@/lib/tour';
import { colors, radius, space, type } from '@/lib/theme';

// Keys into the tour section of src/locales/<code>.ts.
const STEPS = [
  { icon: '🕊', key: 'ask' },
  { icon: '🙏', key: 'pray' },
  { icon: '📅', key: 'promise' },
  { icon: '✨', key: 'tokens' },
  { icon: '🛡', key: 'safe' },
] as const;

export default function TourScreen() {
  const { session } = useAuth();
  const { t, wording } = useLocale();
  const [step, setStep] = useState(0);
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const finish = async () => {
    if (session) await markTourSeen(session.user.id);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Text style={type.small} aria-live="polite">
            {t('tour.progress', { n: step + 1, total: STEPS.length })}
          </Text>
          {!last ? <Button small variant="ghost" label={t('tour.skip')} onPress={finish} /> : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.icon} importantForAccessibility="no" accessibilityElementsHidden>
            {wording === 'neutral' && s.key === 'pray' ? '🤝' : s.icon}
          </Text>
          <Text style={type.title} role="heading">
            {t(`tour.${s.key}Title`)}
          </Text>
          <Text style={[type.body, styles.body]}>{t(`tour.${s.key}Body`)}</Text>
        </View>
        <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {STEPS.map((x, i) => (
            <View key={x.key} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.row}>
          {step > 0 ? <Button variant="secondary" label={t('tour.back')} onPress={() => setStep(step - 1)} /> : null}
          <Button label={last ? t('tour.start') : t('tour.next')} onPress={last ? finish : () => setStep(step + 1)} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, flexGrow: 1, justifyContent: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.md, borderWidth: 1, borderColor: colors.border },
  icon: { fontSize: 44 },
  body: { fontSize: 18, lineHeight: 27 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.primary, width: 20 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
});
