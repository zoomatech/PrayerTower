// Harmful prayers (docs/HARMFUL_PRAYERS.md): the admin switches, and the moderators'
// list of floods from one account, decided in one step. Off by default.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Toggle } from '@/components/ui';
import { api, type HarmFlood, type HarmReport, type HarmSettings, type ModerationDashboard, type ModeratorCare } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

const HIDEABLE = ['threat', 'hate', 'harm_wish', 'curse', 'revenge'] as const;

export function HarmSettingsSection() {
  const t = useT();
  const [s, setS] = useState<HarmSettings | null>(null);
  const [draft, setDraft] = useState({ foul: '', flood: '', words: '' });
  const [note, setNote] = useState<string | null>(null);
  const show = (x: HarmSettings) => {
    setS(x);
    setDraft({ foul: String(x.foul_hold_at), flood: String(x.flood_per_day), words: x.extra_hate_words.join('\n') });
  };
  useFocusEffect(
    useCallback(() => {
      api.harmSettings().then((r) => show(r.settings), (e) => setNote(errorText(e)));
    }, []),
  );
  const save = (patch: Partial<HarmSettings> = {}) =>
    api
      .updateHarmSettings({
        foul_hold_at: Number.parseInt(draft.foul, 10) || undefined,
        flood_per_day: Number.parseInt(draft.flood, 10) || undefined,
        extra_hate_words: draft.words.split('\n').map((w) => w.trim()).filter((w) => w.length >= 2),
        ...patch,
      })
      .then((r) => (show(r.settings), setNote(t('harm.saved'))))
      .catch((e) => setNote(errorText(e)));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('harm.section')}</Text>
      <Toggle label={t('harm.enabled')} hint={t('harm.enabledHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      {HIDEABLE.map((c) => (
        <Toggle
          key={c}
          label={t('harm.hide', { category: t(`harm.category.${c}`) })}
          hint={t('harm.hideHint')}
          value={s[`${c}_action`] === 'hold'}
          onChange={(v) => save({ [`${c}_action`]: v ? 'hold' : 'review' })}
        />
      ))}
      <Toggle label={t('harm.abuse')} value={s.abuse_action === 'support'} onChange={(v) => save({ abuse_action: v ? 'support' : 'allow' })} />
      <Toggle label={t('harm.junk')} value={s.foul_junk_filter} onChange={(v) => save({ foul_junk_filter: v })} />
      <Toggle label={t('harm.explain')} value={s.explain_held} onChange={(v) => save({ explain_held: v })} />
      <Field label={t('harm.foulAt')} keyboardType="number-pad" value={draft.foul} onChangeText={(foul) => setDraft((d) => ({ ...d, foul }))} />
      <Field label={t('harm.floodPerDay')} keyboardType="number-pad" value={draft.flood} onChangeText={(flood) => setDraft((d) => ({ ...d, flood }))} />
      <Field label={t('harm.words')} multiline autoCapitalize="none" value={draft.words} onChangeText={(words) => setDraft((d) => ({ ...d, words }))} />
      <Button label={t('harm.save')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Moderator care: blur, breaks, handing items on. Off by default. */
export function ModeratorCareSection() {
  const t = useT();
  const [s, setS] = useState<ModeratorCare['settings'] | null>(null);
  const [draft, setDraft] = useState({ minutes: '', items: '', length: '' });
  const [note, setNote] = useState<string | null>(null);
  const show = (x: ModeratorCare['settings']) => {
    setS(x);
    setDraft({ minutes: String(x.break_after_minutes), items: String(x.break_after_hard_items), length: String(x.break_minutes) });
  };
  useFocusEffect(
    useCallback(() => {
      api.moderatorCare().then((r) => show(r.settings), (e) => setNote((e as Error).message));
    }, []),
  );
  const num = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v) : undefined);
  const save = (patch: Partial<ModeratorCare['settings']> = {}) =>
    api
      .updateModeratorCare({ break_after_minutes: num(draft.minutes), break_after_hard_items: num(draft.items), break_minutes: num(draft.length) || undefined, ...patch })
      .then((r) => (show(r.settings), setNote(t('modCare.saved'))))
      .catch((e) => setNote((e as Error).message));
  if (!s) return note ? <Text style={type.small}>{note}</Text> : null;
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('modCare.section')}</Text>
      <Toggle label={t('modCare.enabled')} hint={t('modCare.enabledHint')} value={s.enabled} onChange={(v) => save({ enabled: v })} />
      <Toggle label={t('modCare.blur')} value={s.blur_hard} onChange={(v) => save({ blur_hard: v })} />
      <Toggle label={t('modCare.dashboard')} value={s.dashboard_enabled} onChange={(v) => save({ dashboard_enabled: v })} />
      <Toggle label={t('modCare.weekly')} hint={t('modCare.weeklyHint')} value={s.weekly_report_enabled} onChange={(v) => save({ weekly_report_enabled: v })} />
      <Toggle label={t('modCare.restoreToggle')} hint={t('modCare.restoreHint')} value={s.restore_enabled} onChange={(v) => save({ restore_enabled: v })} />
      <Field label={t('modCare.breakAfterMinutes')} keyboardType="number-pad" value={draft.minutes} onChangeText={(minutes) => setDraft((d) => ({ ...d, minutes }))} />
      <Field label={t('modCare.breakAfterItems')} keyboardType="number-pad" value={draft.items} onChangeText={(items) => setDraft((d) => ({ ...d, items }))} />
      <Field label={t('modCare.breakMinutes')} keyboardType="number-pad" value={draft.length} onChangeText={(length) => setDraft((d) => ({ ...d, length }))} />
      <Button label={t('modCare.save')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

/** Admin → Moderation dashboard: queue size and waits, decision speed, false alarms, floods, and the weekly reports. */
export function ModerationDashboardSection() {
  const t = useT();
  const [data, setData] = useState<{ dashboard: ModerationDashboard; reports: HarmReport[] } | null>(null);
  useFocusEffect(
    useCallback(() => {
      // Switched off: the server says 403 and the section stays hidden.
      api.moderationDashboard().then(setData, () => setData(null));
    }, []),
  );
  if (!data) return null;
  const d = data.dashboard;
  const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)}%`);
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{t('modCare.dashTitle', { days: d.days })}</Text>
      <Text style={type.body}>{t('modCare.dashQueue')}</Text>
      {d.queue.length ? (
        d.queue.map((r) => (
          <Text key={r.source} style={type.small}>
            {t('modCare.dashQueueRow', { source: t(`moderation.source.${r.source}`), pending: r.pending, oldest: r.oldest_minutes ?? 0 })}
          </Text>
        ))
      ) : (
        <Text style={type.small}>{t('modCare.dashEmpty')}</Text>
      )}
      <Text style={type.body}>{t('modCare.dashSpeed')}</Text>
      {d.speed.map((r) => (
        <Text key={r.source} style={type.small}>
          {t('modCare.dashSpeedRow', { source: t(`moderation.source.${r.source}`), decided: r.decided, median: r.median_minutes ?? 0, p90: r.p90_minutes ?? 0 })}
        </Text>
      ))}
      <Text style={type.body}>{t('modCare.dashFalse')}</Text>
      {d.falseAlarms.map((r) => (
        <Text key={r.category} style={type.small}>
          {t('modCare.dashFalseRow', { category: r.category, dismissed: r.dismissed, decided: r.decided, rate: pct(r.rate) })}
        </Text>
      ))}
      <Text style={type.small}>{t('modCare.dashFloods', { floods: d.floods.floods, accounts: d.floods.accounts, items: d.floods.items, handoffs: d.handoffs })}</Text>
      {data.reports.slice(0, 1).map((r) => (
        <View key={r.id} style={{ gap: space.xs }}>
          <Text style={type.body}>{t('modCare.dashReport', { week: r.week_start.slice(0, 10), flagged: r.report.flagged, bundled: r.report.bundled })}</Text>
          {r.report.rules.map((x) => (
            <Text key={x.rule} style={type.small}>
              {x.rule}: {t('modCare.dashRuleRow', { flagged: x.flagged, dismissed: x.dismissed, removed: x.removed, rate: pct(x.falseAlarmRate) })}
              {x.tooLoose ? ` · ${t('modCare.tooLoose')}` : ''}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Moderators: an account's bundled flood, shown again or removed in one step. Nothing shows when there are none. */
export function HarmFloods({ onError }: { onError: (message: string) => void }) {
  const t = useT();
  const [floods, setFloods] = useState<HarmFlood[]>([]);
  const load = useCallback(() => {
    api.harmFloods().then((r) => setFloods(r.floods), () => setFloods([]));
  }, []);
  useFocusEffect(load);
  const decide = (f: HarmFlood, action: 'release' | 'remove') =>
    api.decideHarmFlood(f.user_id, action).then(load, (e) => onError(errorText(e)));
  if (!floods.length) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.heading}>{t('harm.floods')}</Text>
      {floods.map((f) => (
        <View key={f.user_id} style={styles.section}>
          <Text style={type.small}>{t('harm.floodItems', { name: f.display_name, count: f.items, categories: f.categories.join(', ') })}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Button small variant="secondary" label={t('harm.release')} onPress={() => decide(f, 'release')} />
            <Button small variant="ghost" label={t('harm.remove')} onPress={() => decide(f, 'remove')} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
});
