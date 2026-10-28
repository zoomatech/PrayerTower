// First-run tour: five short cards on how Prayer Tower works. Shown once per
// member on this device after onboarding, and any time from Me → How Prayer
// Tower works.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { markTourSeen } from '@/lib/tour';
import { colors, radius, space, type } from '@/lib/theme';

const STEPS = [
  {
    icon: '🕊',
    title: 'Ask for prayer',
    body: 'Tap "Type your prayer here" on the Prayers tab. Share a need, a praise or a testimony in a few words, with your name or anonymously.',
  },
  {
    icon: '🙏',
    title: 'Pray now',
    body: 'When you pray for someone, tap "Praying Now" on their request. They see that a real person is praying for them right then. Please tap it only when you truly pray.',
  },
  {
    icon: '📅',
    title: 'Keep a promise to pray',
    body: '"Commit to Pray" lets you promise to pray daily or weekly. Prayer Tower gently reminds you, and your promises live under My Promises.',
  },
  {
    icon: '✨',
    title: 'Tokens, never money',
    body: 'Praying for others and keeping your promises earns tokens. Use them to help a request reach more people, or give them to someone. Tokens can never be bought or cashed out.',
  },
  {
    icon: '🛡',
    title: 'A safe place',
    body: 'Report anything that breaks the community rules, and block anyone you like. Real moderators read every report. If someone is in crisis, Prayer Tower shows a crisis line right away.',
  },
] as const;

export default function TourScreen() {
  const { session } = useAuth();
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
            {step + 1} of {STEPS.length}
          </Text>
          {!last ? <Button small variant="ghost" label="Skip" onPress={finish} /> : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.icon} importantForAccessibility="no" accessibilityElementsHidden>
            {s.icon}
          </Text>
          <Text style={type.title} role="heading">
            {s.title}
          </Text>
          <Text style={[type.body, styles.body]}>{s.body}</Text>
        </View>
        <View style={styles.dots} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {STEPS.map((x, i) => (
            <View key={x.title} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.row}>
          {step > 0 ? <Button variant="secondary" label="Back" onPress={() => setStep(step - 1)} /> : null}
          <Button label={last ? 'Start praying' : 'Next'} onPress={last ? finish : () => setStep(step + 1)} />
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
