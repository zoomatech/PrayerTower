// An event's row in a list, and its time formatted for the member's locale.
import { EVENT_KIND_LABELS, type PrayerEvent } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from '@/lib/theme';

export const whenText = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function EventRow({ e }: { e: PrayerEvent }) {
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/event/${e.id}`)} accessibilityRole="link">
      <View style={styles.top}>
        <Text style={[type.heading, { flex: 1 }]}>{e.title}</Text>
        <Text style={type.script}>{EVENT_KIND_LABELS[e.kind]}</Text>
      </View>
      <Text style={styles.when}>{e.live ? 'Happening now' : whenText(e.startsAt)}</Text>
      <Text style={type.small}>
        {[e.hasVideo ? 'Video meeting' : null, e.location, e.groupTitle ? `Group: ${e.groupTitle}` : null].filter(Boolean).join(' · ')}
      </Text>
      <Text style={type.small}>
        Hosted by {e.isHost ? 'you' : e.host.name} · {e.going} going{e.myRsvp ? ` · you're ${e.myRsvp === 'going' ? 'going' : 'a maybe'}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  when: { fontWeight: '700', color: colors.primary },
});
