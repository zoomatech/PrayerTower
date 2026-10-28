// An event's row in a list, and its time formatted for the member's locale.
import { EVENT_KIND_LABELS, type PrayerEvent } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export const whenText = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function EventRow({ e }: { e: PrayerEvent }) {
  const { t, label } = useLocale();
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/event/${e.id}`)} accessibilityRole="link">
      <View style={styles.top}>
        <Text style={[type.heading, { flex: 1 }]}>{e.title}</Text>
        <Text style={type.script}>{label('eventKind', e.kind, EVENT_KIND_LABELS[e.kind])}</Text>
      </View>
      <Text style={styles.when}>{e.live ? t('events.happening') : whenText(e.startsAt)}</Text>
      <Text style={type.small}>
        {[e.hasVideo ? t('events.videoMeeting') : null, e.location, e.groupTitle ? t('events.groupLabel', { name: e.groupTitle }) : null].filter(Boolean).join(' · ')}
      </Text>
      <Text style={type.small}>
        {e.isHost ? t('events.hostedYou', { count: e.going }) : t('events.hostedBy', { name: e.host.name, count: e.going })}
        {e.myRsvp ? ` · ${e.myRsvp === 'going' ? t('events.youreGoing') : t('events.youreMaybe')}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  when: { fontWeight: '700', color: colors.primary },
});
