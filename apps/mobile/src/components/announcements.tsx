// Announcements from staff (Admin → Announcements), shown at the top of the
// feed until the member dismisses them. A banner is one line; a notice is a
// card with a title and text. In Spanish, the Spanish text when there is one.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type Announcement } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export function localized(a: Announcement, language: string) {
  return language === 'es' && a.titleEs ? { title: a.titleEs, body: a.bodyEs ?? '' } : { title: a.title, body: a.body };
}

export function Announcements() {
  const { t, language } = useLocale();
  const [items, setItems] = useState<Announcement[]>([]);

  useFocusEffect(
    useCallback(() => {
      // Offline or failing: show nothing rather than an error over the feed.
      api.announcements().then((r) => setItems(r.announcements), () => undefined);
    }, []),
  );

  if (!items.length) return null;
  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((a) => a.id !== id));
    api.dismissAnnouncement(id).catch(() => undefined);
  };

  return (
    <View style={{ gap: space.sm }} role="region" aria-label={t('announcements.label')}>
      {items.map((a) => {
        const { title, body } = localized(a, language);
        return (
          <View key={a.id} style={[styles.box, a.kind === 'notice' && styles.notice]}>
            <View style={{ flex: 1, gap: space.xs }}>
              <Text style={a.kind === 'notice' ? type.heading : styles.bannerText}>{title}</Text>
              {a.kind === 'notice' && body ? <Text style={type.body}>{body}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('announcements.dismiss', { title })}
              hitSlop={10}
              onPress={() => dismiss(a.id)}
              style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.md },
  notice: { borderWidth: 1, borderColor: colors.primary },
  bannerText: { ...type.body, fontWeight: '600' },
  close: { minWidth: 24, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  closeText: { ...type.body, color: colors.primary, fontWeight: '700' },
});
