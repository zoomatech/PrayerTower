// One event: details, RSVP, the meeting link once you're going, notes for the host, cancel (host), report.
import { EVENT_KIND_LABELS, type PrayerEvent } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { whenText } from '@/components/events';
import { EventInputs } from '@/components/notebook';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function EventScreen() {
  const { t, label } = useLocale();
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
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))} />
        <ErrorText error={error} />
        {e ? (
          <View style={styles.card}>
            <Text style={type.script}>{label('eventKind', e.kind, EVENT_KIND_LABELS[e.kind])}</Text>
            <Text style={type.title}>{e.title}</Text>
            {e.cancelled ? <Text style={styles.cancelled}>{t('events.cancelled')}</Text> : null}
            <Text style={styles.when}>
              {e.live ? t('events.happening') : whenText(e.startsAt)} · {t('events.minutesShort', { count: e.durationMinutes })}
            </Text>
            {e.description ? <Text style={type.body}>{e.description}</Text> : null}
            {e.location ? <Text style={type.body}>📍 {e.location}</Text> : null}
            {e.groupTitle ? <Text style={type.small}>{t('events.forGroup', { name: e.groupTitle })}</Text> : null}
            <Text style={type.small}>
              {e.isHost ? t('events.hostedYou', { count: e.going }) : t('events.hostedBy', { name: e.host.name, count: e.going })}
            </Text>
            {e.host.pastor ? (
              <Text style={type.small} accessibilityLabel={t('card.pastorBadge', { title: e.host.pastor.title, church: e.host.pastor.church })}>
                ✝ {e.host.pastor.title} · {e.host.pastor.church}
              </Text>
            ) : null}

            {e.videoUrl ? (
              <Button label={e.live ? t('events.joinNow') : t('events.openLink')} onPress={() => Linking.openURL(e.videoUrl!).catch(() => undefined)} />
            ) : e.hasVideo ? (
              <Text style={type.small}>{t('events.rsvpForLink')}</Text>
            ) : null}

            {!e.cancelled && !e.isHost ? (
              <View style={styles.row}>
                <Button small variant={e.myRsvp === 'going' ? 'primary' : 'secondary'} label={e.myRsvp === 'going' ? t('events.goingOn') : t('events.going')} onPress={() => run(() => api.rsvp(id, 'going'))} />
                <Button small variant={e.myRsvp === 'maybe' ? 'primary' : 'secondary'} label={t('events.maybe')} onPress={() => run(() => api.rsvp(id, 'maybe'))} />
                {e.myRsvp ? <Button small variant="ghost" label={t('events.cantMake')} onPress={() => run(() => api.unrsvp(id))} /> : null}
              </View>
            ) : null}
            {e.myRsvp === 'going' && !e.cancelled ? <Text style={type.small}>{t('events.reminder')}</Text> : null}
            {e.isHost && !e.cancelled ? <Button small variant="ghost" label={t('events.cancel')} onPress={() => run(() => api.cancelEvent(id))} /> : null}
          </View>
        ) : null}

        {e && !e.cancelled && (e.isHost || e.myRsvp) ? <EventInputs eventId={id} /> : null}

        {e && !e.isHost ? (
          reporting ? (
            <View style={styles.card}>
              <Text style={type.heading}>{t('events.report')}</Text>
              <Field placeholder={t('conversation.whatsWrong')} value={reason} onChangeText={setReason} maxLength={1000} multiline />
              <View style={styles.row}>
                <Button
                  small
                  label={t('actions.sendReport')}
                  disabled={!reason.trim()}
                  onPress={() =>
                    api
                      .report('event', id, reason.trim())
                      .then(() => {
                        setReporting(false);
                        setNote(t('events.reportDone'));
                      })
                      .catch((err) => setError((err as Error).message))
                  }
                />
                <Button small variant="ghost" label={t('common.cancel')} onPress={() => setReporting(false)} />
              </View>
            </View>
          ) : (
            <Text style={styles.report} onPress={() => setReporting(true)} accessibilityRole="button">
              {note ?? t('events.report')}
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
