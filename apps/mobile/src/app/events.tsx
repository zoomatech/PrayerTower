// Prayer meetings, local meet-ups, seminars and outreach (notebook Page 9 #7–8,
// Page 12 EVENTS). Upcoming events, and a form to host one. With ?groupId, the
// list and the new event belong to that group.
import { EVENT_KIND_LABELS, type EventKind, type PrayerEvent } from '@prayer-tower/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EventRow, whenText } from '@/components/events';
import { Button, Chip, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { nextWeekday, parseLocal, WHEN_OPTIONS } from '@/lib/schedule';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

// Restorative circles are scheduled by moderators and pastors only.
const MEMBER_KINDS: EventKind[] = ['prayer_meeting', 'meetup', 'seminar', 'outreach'];
const STAFF_KINDS: EventKind[] = [...MEMBER_KINDS, 'circle'];
const WHEN = [{ key: 'wed', label: 'Wednesday 7 pm', at: () => nextWeekday(3, 19) }, ...WHEN_OPTIONS];

export default function Events() {
  const { t, label } = useLocale();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const { roles } = useAuth();
  const staff = roles.some((r) => r === 'admin' || r === 'moderator' || r === 'pastor_counselor');
  const [events, setEvents] = useState<PrayerEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<EventKind>('prayer_meeting');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState<string>('wed');
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState('60');
  const [videoUrl, setVideoUrl] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setEvents((await api.events(groupId)).events);
      setLoaded(true);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const startsAt = when === 'custom' ? parseLocal(custom) : (WHEN.find((w) => w.key === when)?.at() ?? null);

  const create = async () => {
    if (!startsAt) return setError(t('events.dateError'));
    setBusy(true);
    setError(null);
    try {
      const r = await api.createEvent({
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
        startsAt: startsAt.toISOString(),
        durationMinutes: Number.parseInt(minutes, 10) || 60,
        videoUrl: videoUrl.trim() || undefined,
        location: location.trim() || undefined,
        groupId: groupId || undefined,
      });
      router.replace(`/event/${r.event.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
        <Text style={type.title}>{groupId ? t('events.groupTitle') : t('messages.events')}</Text>
        <Text style={type.body}>{t('events.intro')}</Text>
        <ErrorText error={error} onRetry={loaded ? undefined : load} />
        {!loaded && !error ? <Loading /> : null}

        {creating ? (
          <View style={styles.card}>
            <View style={styles.row}>
              {(staff ? STAFF_KINDS : MEMBER_KINDS).map((k) => (
                <Chip key={k} label={label('eventKind', k, EVENT_KIND_LABELS[k])} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <Field label={t('events.title')} placeholder={t('events.titlePlaceholder')} value={title} onChangeText={setTitle} maxLength={120} />
            <Field label={t('events.about')} value={description} onChangeText={setDescription} maxLength={2000} multiline />
            <Text style={styles.label}>{t('actions.when')}</Text>
            <View style={styles.row}>
              {WHEN.map((w) => (
                <Chip key={w.key} label={t(`actions.whenOptions.${w.key}`, { defaultValue: w.label })} selected={when === w.key} onPress={() => setWhen(w.key)} />
              ))}
              <Chip label={t('events.otherTime')} selected={when === 'custom'} onPress={() => setWhen('custom')} />
            </View>
            {when === 'custom' ? <Field placeholder="2026-11-06 19:30" value={custom} onChangeText={setCustom} /> : null}
            {startsAt ? <Text style={type.small}>{whenText(startsAt.toISOString())}</Text> : null}
            <Field label={t('events.minutes')} keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
            <Field
              label={t('events.video')}
              placeholder="https://zoom.us/j/…"
              autoCapitalize="none"
              keyboardType="url"
              value={videoUrl}
              onChangeText={setVideoUrl}
            />
            <Field label={t('events.place')} placeholder={t('events.placePlaceholder')} value={location} onChangeText={setLocation} maxLength={200} />
            {location.trim() ? <Text style={type.small}>{t('events.safety')}</Text> : null}
            <View style={styles.row}>
              <Button label={t('events.host')} onPress={create} busy={busy} disabled={!title.trim() || (!videoUrl.trim() && !location.trim())} />
              <Button variant="ghost" label={t('common.cancel')} onPress={() => setCreating(false)} />
            </View>
          </View>
        ) : (
          <Button label={t('events.hostAn')} onPress={() => setCreating(true)} />
        )}

        {loaded && events.length === 0 ? <Empty text={t('events.empty')} /> : null}
        {events.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { fontWeight: '600', color: colors.text },
});
