// One event: details, RSVP, the meeting link once you're going, cancel (host), report.
import { EVENT_KIND_LABELS, type PrayerEvent } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { whenText } from '@/components/events';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<PrayerEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEvent((await api.event(id)).event);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<{ event: PrayerEvent } | unknown>) => {
    try {
      const r = (await fn()) as { event?: PrayerEvent };
      if (r?.event) setEvent(r.event);
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const e = event;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} />
        <ErrorText error={error} />
        {e ? (
          <View style={styles.card}>
            <Text style={type.script}>{EVENT_KIND_LABELS[e.kind]}</Text>
            <Text style={type.title}>{e.title}</Text>
            {e.cancelled ? <Text style={styles.cancelled}>This event was cancelled.</Text> : null}
            <Text style={styles.when}>
              {e.live ? 'Happening now' : whenText(e.startsAt)} · {e.durationMinutes} min
            </Text>
            {e.description ? <Text style={type.body}>{e.description}</Text> : null}
            {e.location ? <Text style={type.body}>📍 {e.location}</Text> : null}
            {e.groupTitle ? <Text style={type.small}>For the group {e.groupTitle}</Text> : null}
            <Text style={type.small}>
              Hosted by {e.isHost ? 'you' : e.host.name} · {e.going} going
            </Text>

            {e.videoUrl ? (
              <Button label={e.live ? 'Join the video meeting now' : 'Open the video meeting link'} onPress={() => Linking.openURL(e.videoUrl!).catch(() => undefined)} />
            ) : e.hasVideo ? (
              <Text style={type.small}>Say you're coming to see the video meeting link.</Text>
            ) : null}

            {!e.cancelled && !e.isHost ? (
              <View style={styles.row}>
                <Button small variant={e.myRsvp === 'going' ? 'primary' : 'secondary'} label={e.myRsvp === 'going' ? "✓ I'm going" : "I'm going"} onPress={() => run(() => api.rsvp(id, 'going'))} />
                <Button small variant={e.myRsvp === 'maybe' ? 'primary' : 'secondary'} label="Maybe" onPress={() => run(() => api.rsvp(id, 'maybe'))} />
                {e.myRsvp ? <Button small variant="ghost" label="Can't make it" onPress={() => run(() => api.unrsvp(id))} /> : null}
              </View>
            ) : null}
            {e.myRsvp === 'going' && !e.cancelled ? <Text style={type.small}>We'll remind you shortly before it starts.</Text> : null}
            {e.isHost && !e.cancelled ? <Button small variant="ghost" label="Cancel this event" onPress={() => run(() => api.cancelEvent(id))} /> : null}
          </View>
        ) : null}

        {e && !e.isHost ? (
          reporting ? (
            <View style={styles.card}>
              <Text style={type.heading}>Report this event</Text>
              <Field placeholder="What's wrong with it?" value={reason} onChangeText={setReason} maxLength={1000} multiline />
              <View style={styles.row}>
                <Button
                  small
                  label="Send report"
                  disabled={!reason.trim()}
                  onPress={() =>
                    api
                      .report('event', id, reason.trim())
                      .then(() => {
                        setReporting(false);
                        setNote('Thank you. A moderator will look at it.');
                      })
                      .catch((err) => setError((err as Error).message))
                  }
                />
                <Button small variant="ghost" label="Cancel" onPress={() => setReporting(false)} />
              </View>
            </View>
          ) : (
            <Text style={styles.report} onPress={() => setReporting(true)} accessibilityRole="button">
              {note ?? 'Report this event'}
            </Text>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  when: { fontWeight: '700', color: colors.primary },
  cancelled: { color: colors.danger, fontWeight: '700' },
  report: { fontSize: 14, color: colors.textMuted, textDecorationLine: 'underline' },
});
