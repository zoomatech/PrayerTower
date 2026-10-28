// Crisis support box (988 Suicide & Crisis Lifeline), shown on requests and
// comments that mention suicide or self-harm. See the Safe Messaging rules.
import { CRISIS_SUPPORT } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

export function CrisisSupport() {
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text style={type.heading}>{CRISIS_SUPPORT.title}</Text>
      <Text style={type.body}>{CRISIS_SUPPORT.body}</Text>
      <View style={styles.row}>
        <Button small label="Call 988" onPress={() => open(CRISIS_SUPPORT.call)} />
        <Button small variant="secondary" label="Text 988" onPress={() => open(CRISIS_SUPPORT.text)} />
        <Button small variant="secondary" label="Chat online" onPress={() => open(CRISIS_SUPPORT.chat)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
