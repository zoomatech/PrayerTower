import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DoveIcon } from '@/components/dove-icon';
import { CornerNav } from '@/components/corner-nav';
import { useLocale } from '@/lib/i18n';
import { colors, space } from '@/lib/theme';
import { isDark } from '@/layouts/motifs';
import { useSkinHeader } from '@/skins/skin-header';

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
  const skin = useSkinHeader();
  const dark = skin ? isDark(skin.backdrop) : false;
  return (
    <Tabs style={styles.root}>
      <View style={styles.root}>
        {/* Home and the menu on the left, the logo on the right, all standing on one line (Steve,
            2026-11-02). The logo is hidden for Open Circle (neutral wording, either edition): it has
            its own brand. On a dark skin the logo is the reversed one: "prayer tower" and the cross
            stay red and the rest of the logo is light blue. */}
        <View
          style={[styles.topBar, { paddingTop: insets.top + space.xs }, skin ? { backgroundColor: skin.backdrop, borderBottomColor: skin.accent, borderBottomWidth: 3 } : null]}
          testID={skin ? 'skin-header' : undefined}
        >
          <CornerNav color={dark ? '#FFFFFF' : colors.text} />
          {wording !== 'neutral' ? (
            <Image
              source={dark ? require('../../../assets/images/prayer-tower-logo-dark.png') : require('../../../assets/images/prayer-tower-logo.png')}
              style={styles.logo}
              accessibilityRole="image"
              aria-label="The Prayer Tower"
              testID="app-logo"
            />
          ) : null}
        </View>
        <TabSlot style={styles.root} />
      </View>
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
  // Bottom-aligned, so the buttons and the logo share one baseline.
  topBar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: space.sm, paddingRight: space.md, paddingBottom: space.xs, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  logo: { width: 67, height: 44 },
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
  // Full text color: over a dark skin the 75% bar is grey, where the muted color fails contrast.
  label: { fontSize: 12, color: colors.text },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
