// Small shared building blocks.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, maxContentWidth, radius, space, type } from '@/lib/theme';
import { useT } from '@/lib/i18n';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={[styles.inner, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  small,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  /** For native UI tests (Maestro: `tapOn: { id: … }`). */
  testID?: string;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      // Small buttons are drawn 34pt tall; the slop makes the tap area Apple's 44pt minimum.
      hitSlop={small ? 5 : undefined}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
      ]}>
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const buttonVariants = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

/** A choice chip. `radio` marks a pick-one group, so screen readers announce it as a radio button. */
export function Chip({ label, selected, onPress, radio }: { label: string; selected: boolean; onPress: () => void; radio?: boolean }) {
  return (
    <Pressable
      role={radio ? 'radio' : 'checkbox'}
      aria-checked={selected}
      hitSlop={6}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput accessibilityLabel={label ?? rest.placeholder} placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable role="switch" aria-checked={value} onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={type.body}>{label}</Text>
        {hint ? <Text style={type.small}>{hint}</Text> : null}
      </View>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

/** Shown once before posting text the AI would flag (Instagram-style nudge). Posting anyway is allowed. */
export function RulesWarning({ onPostAnyway, busy }: { onPostAnyway: () => void; busy?: boolean }) {
  const t = useT();
  return (
    <View style={styles.warning}>
      <Text style={type.body}>{t('rulesWarning.text')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Button small variant="ghost" label={t('rulesWarning.postAnyway')} busy={busy} onPress={onPostAnyway} />
      </View>
    </View>
  );
}

/** An error line. With onRetry it also offers "Try again", for a screen whose data didn't load. */
export function ErrorText({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  const t = useT();
  if (!error) return null;
  if (!onRetry) return <Text style={styles.error}>{error}</Text>;
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: space.sm, alignItems: 'flex-start' }}>
      <Text style={styles.error}>{error}</Text>
      <Button small variant="secondary" label={t('common.tryAgain')} onPress={onRetry} />
    </View>
  );
}

/** Shown while a screen's first load is on its way, so a slow connection never looks like an empty list. */
export function Loading() {
  const t = useT();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.sm, padding: space.xl }}>
      <ActivityIndicator color={colors.primary} />
      <Text style={type.small}>{t('common.loading')}</Text>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={[type.small, { textAlign: 'center', padding: space.xl }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: maxContentWidth },
  button: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  buttonSmall: { paddingVertical: space.xs, paddingHorizontal: space.md, minHeight: 34 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 14 },
  label: { ...type.small, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 16,
    color: colors.text,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: colors.border, padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 18 }] },
  error: { color: colors.danger, fontSize: 14 },
  warning: { backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: space.md, gap: space.sm },
});
