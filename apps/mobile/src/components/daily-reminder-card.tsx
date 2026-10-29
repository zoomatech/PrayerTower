// A daily reminder at a time and on days the member picks (Admin → Gentle
// reminders). The server skips it on a day they already prayed, never mentions
// a missed day, and slows to once a week after a quiet stretch.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field } from '@/components/ui';
import { api, type DailyReminder } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const pad = (n: number) => String(n).padStart(2, '0');
/** "7:30", "07:30" or "19:05" → hour and minute, or null. */
export function parseTime(text: string): { hour: number; minute: number } | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function DailyReminderCard() {
  const { dailyReminder } = useFeatures();
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState<DailyReminder | null>(null);
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('08:00');
  const [days, setDays] = useState<number[]>([...DAYS]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const show = (r: Awaited<ReturnType<typeof api.dailyReminder>>) => {
    setEnabled(r.enabled);
    const mine = r.enabled ? r.reminder : null;
    setSaved(mine);
    if (mine) {
      setTime(`${pad(mine.hour)}:${pad(mine.minute)}`);
      setDays(mine.days);
    }
  };
  useEffect(() => {
    if (!dailyReminder) return;
    api
      .dailyReminder()
      .then(show)
      .catch((e) => setError((e as Error).message));
  }, [dailyReminder]);

  if (!dailyReminder || !enabled) return null;
  const save = async () => {
    const at = parseTime(time);
    if (!at) return setError(t('reminders.badTime'));
    if (!days.length) return setError(t('reminders.noDays'));
    setError(null);
    try {
      show(await api.setDailyReminder({ ...at, days, timeZone: zone() }));
      setEditing(false);
      setNote(t('reminders.saved'));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const off = async () => {
    try {
      show(await api.setDailyReminder({ off: true }));
      setEditing(false);
      setNote(t('reminders.offNote'));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const dayList = (d: number[]) => (d.length === 7 ? t('reminders.everyDay') : d.map((x) => t(`practices.days.d${x}`)).join(', '));

  return (
    <View style={styles.card} testID="daily-reminder-card">
      <Text style={type.heading}>{t('reminders.title')}</Text>
      <Text style={type.small}>{t('reminders.intro')}</Text>
      {saved && !editing ? (
        <>
          <Text style={type.body}>
            {t('reminders.current', {
              time: `${pad(saved.hour)}:${pad(saved.minute)}`,
              days: dayList(saved.days),
            })}
          </Text>
          <View style={styles.row}>
            <Button small variant="secondary" label={t('reminders.change')} onPress={() => setEditing(true)} />
            <Button small variant="ghost" label={t('reminders.turnOff')} onPress={off} />
          </View>
        </>
      ) : !saved && !editing ? (
        <Button small label={t('reminders.set')} onPress={() => setEditing(true)} />
      ) : (
        <>
          <Field label={t('reminders.time')} value={time} onChangeText={setTime} placeholder="08:00" keyboardType="numbers-and-punctuation" />
          <View style={styles.row} role="group" aria-label={t('reminders.days')}>
            {DAYS.map((d) => (
              <Chip
                key={d}
                label={t(`practices.days.d${d}`)}
                selected={days.includes(d)}
                onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d].sort()))}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Button small label={t('reminders.save')} onPress={save} />
            <Button small variant="ghost" label={t('reminders.cancel')} onPress={() => setEditing(false)} />
          </View>
        </>
      )}
      {note ? <Text style={type.small}>{note}</Text> : null}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
