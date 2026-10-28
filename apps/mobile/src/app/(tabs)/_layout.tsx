import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '@/lib/theme';

function TabButton({ icon, label, isFocused, ref: _ref, ...props }: TabTriggerSlotProps & { icon: string; label: string }) {
  return (
    <Pressable {...props} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: isFocused }}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={StyleSheet.flatten([styles.label, isFocused && styles.labelActive])}>{label}</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.root} />
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }])}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="🕊" label="Prayers" />
          </TabTrigger>
          <TabTrigger name="commitments" href="/commitments" asChild>
            <TabButton icon="🙏" label="My Promises" />
          </TabTrigger>
          <TabTrigger name="messages" href="/messages" asChild>
            <TabButton icon="💬" label="Messages" />
          </TabTrigger>
          <TabTrigger name="notifications" href="/notifications" asChild>
            <TabButton icon="🔔" label="Notices" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon="👤" label="Me" />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  icon: { fontSize: 20 },
  label: { fontSize: 12, color: colors.textMuted },
  labelActive: { color: colors.primary, fontWeight: '700' },
});
