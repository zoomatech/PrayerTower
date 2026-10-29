// Harmful prayers (docs/HARMFUL_PRAYERS.md): the admin switches, and the moderators'
// list of floods from one account, decided in one step. Off by default.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Toggle } from '@/components/ui';
import { api, type HarmFlood, type HarmSettings, type ModeratorCare } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

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
      api.harmSettings().then((r) => show(r.settings), (e) => setNote((e as Error).message));
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
      .catch((e) => setNote((e as Error).message));
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
      <Field label={t('modCare.breakAfterMinutes')} keyboardType="number-pad" value={draft.minutes} onChangeText={(minutes) => setDraft((d) => ({ ...d, minutes }))} />
      <Field label={t('modCare.breakAfterItems')} keyboardType="number-pad" value={draft.items} onChangeText={(items) => setDraft((d) => ({ ...d, items }))} />
      <Field label={t('modCare.breakMinutes')} keyboardType="number-pad" value={draft.length} onChangeText={(length) => setDraft((d) => ({ ...d, length }))} />
      <Button label={t('modCare.save')} onPress={() => save()} />
      {note ? <Text style={type.small}>{note}</Text> : null}
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
    api.decideHarmFlood(f.user_id, action).then(load, (e) => onError((e as Error).message));
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
