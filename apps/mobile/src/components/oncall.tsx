// The moderator on-call rota (docs/HARMFUL_PRAYERS.md, "On-call rota"), off by default:
// the admin section that sets shifts and the waiting limit, and the moderators' banner
// with who is on call, what is waiting and notes for the next shift.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field, Toggle } from '@/components/ui';
import { api, type OncallSettings, type OncallShift, type OncallStatus } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** "09:30" → 570; "24:00" is the end of the day. */
const minutes = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && n <= 1440 ? n : null;
};

/** Admin → On-call rota. */
export function OncallAdminSection() {
  const t = useT();
  const [data, setData] = useState<{ settings: OncallSettings; shifts: OncallShift[]; people: { id: string; display_name: string }[] } | null>(null);
  const [draft, setDraft] = useState({ wait: '', remind: '', tz: '' });
  const [shift, setShift] = useState({ userId: '', weekday: 1, start: '09:00', end: '17:00' });
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api.oncallAdmin().then(
        (r) => {
          setData(r);
          setDraft({ wait: String(r.settings.max_wait_minutes), remind: String(r.settings.remind_at_percent), tz: r.settings.timezone });
        },
        (e) => setNote((e as Error).message),
      ),
    [],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : undefined);
  const save = (patch: Partial<OncallSettings> = {}) =>
    api
      .updateOncall({ max_wait_minutes: num(draft.wait), remind_at_percent: num(draft.remind), timezone: draft.tz.trim() || undefined, ...patch })
      .then(() => (load(), setNote(t('oncall.saved'))))
      .catch((e) => setNote((e as Error).message));
  const add = () => {
    const start = minutes(shift.start);
    const end = minutes(shift.end);
    if (start === null || end === null || end <= start || !shift.userId) return setNote(t('oncall.badTime'));
    api
      .addOncallShift({ userId: shift.userId, weekday: shift.weekday, startMinute: start, endMinute: end })
      .then(() => (load(), setNote(t('oncall.saved'))))
      .catch((e) => setNote((e as Error).message));
  };
  if (!data) return note ? <Text style={type.small}>{note}</Text> : null;
  const s = data.settings;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('oncall.section')}</Text>
      <Toggle label={t('oncall.enabled')} hint={t('oncall.enabledHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      <Field label={t('oncall.maxWait')} keyboardType="number-pad" value={draft.wait} onChangeText={(wait) => setDraft((d) => ({ ...d, wait }))} />
      <Field label={t('oncall.remindAt')} keyboardType="number-pad" value={draft.remind} onChangeText={(remind) => setDraft((d) => ({ ...d, remind }))} />
      <Field label={t('oncall.timezone')} autoCapitalize="none" value={draft.tz} onChangeText={(tz) => setDraft((d) => ({ ...d, tz }))} />
      <Text style={type.body}>{t('oncall.escalateTo')}</Text>
      <View style={styles.chips}>
        <Chip radio label={t('oncall.everyAdmin')} selected={!s.escalate_to} onPress={() => save({ escalate_to: null })} />
        {data.people.map((p) => (
          <Chip radio key={p.id} label={p.display_name} selected={s.escalate_to === p.id} onPress={() => save({ escalate_to: p.id })} />
        ))}
      </View>
      <Button label={t('oncall.save')} onPress={() => save()} />

      <Text style={type.body}>{t('oncall.shifts')}</Text>
      {data.shifts.length ? (
        data.shifts.map((x) => (
          <View key={x.id} style={styles.row}>
            <Text style={[type.small, { flex: 1 }]}>
              {t('oncall.shiftRow', { day: t(`oncall.days.${x.weekday}`), start: hhmm(x.start_minute), end: hhmm(x.end_minute), name: x.display_name })}
            </Text>
            <Button
              small
              variant="secondary"
              label={t('oncall.remove')}
              onPress={() => api.removeOncallShift(x.id).then(load, (e) => setNote((e as Error).message))}
            />
          </View>
        ))
      ) : (
        <Text style={type.small}>{t('oncall.noShifts')}</Text>
      )}
      <Text style={type.body}>{t('oncall.addShift')}</Text>
      <Text style={type.small}>{t('oncall.who')}</Text>
      <View style={styles.chips}>
        {data.people.map((p) => (
          <Chip radio key={p.id} label={p.display_name} selected={shift.userId === p.id} onPress={() => setShift((x) => ({ ...x, userId: p.id }))} />
        ))}
      </View>
      <Text style={type.small}>{t('oncall.day')}</Text>
      <View style={styles.chips}>
        {DAYS.map((d) => (
          <Chip radio key={d} label={t(`oncall.days.${d}`)} selected={shift.weekday === d} onPress={() => setShift((x) => ({ ...x, weekday: d }))} />
        ))}
      </View>
      <Field label={t('oncall.start')} value={shift.start} onChangeText={(start) => setShift((x) => ({ ...x, start }))} />
      <Field label={t('oncall.end')} value={shift.end} onChangeText={(end) => setShift((x) => ({ ...x, end }))} />
      <Button label={t('oncall.add')} onPress={add} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** The top of the moderation queue: who is on call, what is waiting, and notes between shifts. */
export function OncallBanner() {
  const t = useT();
  const [status, setStatus] = useState<OncallStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => api.oncall().then((r) => setStatus(r.status), () => setStatus(null)), []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  if (!status?.settings.enabled) return null;
  const leave = () =>
    api
      .addOncallNote(draft.trim())
      .then(() => (setDraft(''), setNote(null), load()))
      .catch((e) => setNote((e as Error).message));
  return (
    <View style={[styles.section, status.over ? styles.late : null]} accessibilityRole="summary">
      <Text style={type.body}>{status.onCall.length ? t('oncall.onCallNow', { names: status.onCall.map((o) => o.display_name).join(', ') }) : t('oncall.nobody')}</Text>
      <Text style={type.small}>{t('oncall.waiting', { waiting: status.waiting, oldest: status.oldest_minutes ?? 0, limit: status.settings.max_wait_minutes })}</Text>
      {status.over ? <Text style={type.small}>{t('oncall.over', { over: status.over })}</Text> : null}
      {status.notes.length ? <Text style={type.body}>{t('oncall.notes')}</Text> : null}
      {status.notes.map((n) => (
        <View key={n.id}>
          <Text style={type.small}>{n.body}</Text>
          <Text style={[type.small, { color: colors.textMuted }]}>{t('oncall.noteBy', { name: n.author_name ?? '', when: new Date(n.created_at).toLocaleString() })}</Text>
        </View>
      ))}
      <Field label={t('oncall.noteLabel')} multiline value={draft} onChangeText={setDraft} maxLength={2000} />
      <Button small label={t('oncall.addNote')} disabled={!draft.trim()} onPress={leave} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  late: { borderWidth: 2, borderColor: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
