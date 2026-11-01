// The Home icon in the top-left corner with the hamburger menu right under it
// (Steve, 2026-10-30). Home goes to the Prayers feed; the menu lists the main
// sections, the same ones as the Mac menu bar's Go menu (lib/menu-commands.ts).
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useFeature } from '@/lib/community-features';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space } from '@/lib/theme';

const SIZE = 40;
export const CORNER_NAV_WIDTH = SIZE + space.sm;

function HomeGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
      <Path d="M 3 11 L 12 3 L 21 11 M 6 9 L 6 21 L 10 21 L 10 15 L 14 15 L 14 21 L 18 21 L 18 9" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function MenuGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
      <Path d="M 4 6 L 20 6 M 4 12 L 20 12 M 4 18 L 20 18" fill="none" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

export function CornerNav() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const groupsFeature = useFeature('groups');
  const { topicGroups } = useFeatures();
  const groupsOn = groupsFeature && topicGroups;
  const items: { label: string; href: Href }[] = [
    { label: t('tabs.prayers'), href: '/' },
    { label: t('tabs.promises'), href: '/commitments' },
    { label: t('tabs.messages'), href: '/messages' },
    // Groups (Steve, 2026-10-31), starting with Cancer survivors.
    ...(groupsOn ? [{ label: t('topicGroups.title'), href: '/topic-groups' as Href }] : []),
    { label: t('tabs.notices'), href: '/notifications' },
    { label: t('tabs.me'), href: '/profile' },
    // Settings → Themes → Full Screen Sparkler Theme → Background choices (Steve, 2026-11-01).
    { label: t('menu.settings'), href: '/settings' },
  ];
  const go = (href: Href) => {
    setOpen(false);
    router.navigate(href);
  };
  return (
    <View style={[styles.rail, { paddingTop: insets.top + space.sm }]}>
      <Pressable style={styles.button} onPress={() => router.navigate('/')} accessibilityRole="button" aria-label={t('menu.home')} testID="corner-home">
        <HomeGlyph />
      </Pressable>
      <Pressable style={styles.button} onPress={() => setOpen(true)} accessibilityRole="button" aria-label={t('menu.open')} aria-expanded={open} testID="corner-menu">
        <MenuGlyph />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} aria-label={t('menu.close')}>
          <View style={[styles.sheet, { top: insets.top + space.sm + SIZE * 2 + space.xs }]} role="menu">
            {items.map((item) => (
              <Pressable key={item.label} style={styles.item} onPress={() => go(item.href)} role="menuitem">
                <Text style={styles.itemText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: CORNER_NAV_WIDTH, alignItems: 'center', gap: space.xs, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
  button: { width: SIZE, height: SIZE, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' },
  sheet: { position: 'absolute', left: space.sm, minWidth: 200, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: space.xs },
  item: { paddingVertical: space.md, paddingHorizontal: space.lg },
  itemText: { fontSize: 16, color: colors.text },
});
