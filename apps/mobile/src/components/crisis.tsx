// Crisis support box (the pilot country's crisis line), shown on requests and
// comments that mention suicide or self-harm. See the Safe Messaging rules.
import { crisisLine } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { StyleSheet, Text, View } from 'react-native';

import { env } from '@/lib/env';
import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

const LINE = crisisLine(env.crisisCountry);

export function CrisisSupport() {
  const open = (url: string) => Linking.openURL(url).catch(() => undefined);
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Text style={type.heading}>{LINE.title}</Text>
      <Text style={type.body}>{LINE.body}</Text>
      <View style={styles.row}>
        {LINE.actions.map((a, i) => (
          <Button key={a.url} small variant={i === 0 ? 'primary' : 'secondary'} label={a.label} onPress={() => open(a.url)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
