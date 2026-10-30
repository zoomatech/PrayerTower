import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DoveIcon } from '@/components/dove-icon';
import { useLocale } from '@/lib/i18n';
import { colors, space } from '@/lib/theme';

function TabButton({ icon, label, isFocused, ref: _ref, ...props }: TabTriggerSlotProps & { icon: string | ReactNode; label: string }) {
  return (
    <Pressable {...props} style={styles.tab} role="tab" aria-label={label} aria-selected={!!isFocused}>
      {typeof icon === 'string' ? (
        <Text style={styles.icon} importantForAccessibility="no" accessibilityElementsHidden>
          {icon}
        </Text>
      ) : (
        icon
      )}
      <Text style={StyleSheet.flatten([styles.label, isFocused && styles.labelActive])}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { t, wording } = useLocale();
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.root} />
      <TabList asChild>
        <View role="tablist" aria-label={t('tabs.label')} style={StyleSheet.flatten([styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }])}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={<DoveIcon />} label={t('tabs.prayers')} />
          </TabTrigger>
          <TabTrigger name="commitments" href="/commitments" asChild>
            {/* Open Circle (neutral wording): praying hands are a religious sign there. */}
            <TabButton icon={wording === 'neutral' ? '🤝' : '🙏'} label={t('tabs.promises')} />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤" label={t('tabs.me')} />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // 75% opaque, over the screen so it shows faintly through (Steve, 2026-10-30).
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20 },
  label: { fontSize: 12, color: colors.textMuted },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
