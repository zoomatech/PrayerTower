import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

/** One row of a settings list that opens the next screen. */
export function MenuRow({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} testID={testID}>
      <Text style={type.body}>{label}</Text>
      <Text style={styles.chevron} aria-hidden>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chevron: { fontSize: 24, color: colors.textMuted },
});
