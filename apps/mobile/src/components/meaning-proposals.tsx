// Member-made emoji meanings (docs/CONVERSATION_HELPERS.md): on Me, a member suggests a
// new meaning for one of the emoji; an admin reads it (and can reword it) before it joins
// the tree. Needs Emoji meanings and "Members suggest meanings" switched on.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field } from '@/components/ui';
import { api, type MeaningEmoji, type MeaningProposal, type MeaningProposalQueueItem } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

export function MeaningProposals() {
  const { meaningReactions, meaningProposals } = useFeatures();
  const t = useT();
  const on = meaningReactions && meaningProposals;
  const [tree, setTree] = useState<MeaningEmoji[]>([]);
  const [mine, setMine] = useState<MeaningProposal[]>([]);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!on) return;
    api.reactionMeanings().then((r) => setTree(r.emoji), () => undefined);
    api.meaningProposals().then((r) => setMine(r.proposals), () => undefined);
  }, [on]);
  if (!on || !tree.length) return null;

  const send = async () => {
    if (!emoji || label.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      setMine((await api.proposeMeaning(emoji, label.trim())).proposals);
      setLabel('');
      announce(t('meaningProposals.sent'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const icon = (key: string) => tree.find((e) => e.key === key)?.emoji ?? key;

  return (
    <View style={styles.card} testID="meaning-proposals">
      <Text style={type.heading}>{t('meaningProposals.title')}</Text>
      <Text style={type.small}>{t('meaningProposals.intro')}</Text>
      <View style={styles.row} role="radiogroup">
        {tree.map((e) => (
          <Chip key={e.key} radio label={e.emoji} selected={emoji === e.key} onPress={() => setEmoji(e.key)} />
        ))}
      </View>
      <Field testID="meaning-proposal-text" label={t('meaningProposals.label')} value={label} onChangeText={setLabel} maxLength={40} />
      <Button small label={t('meaningProposals.send')} busy={busy} disabled={!emoji || label.trim().length < 2} onPress={send} />
      <ErrorText error={error} />
      {mine.map((p) => (
        <Text key={p.id} style={type.small}>
          {icon(p.emoji)} {p.label}: {t(`meaningProposals.status.${p.status}`)}
        </Text>
      ))}
    </View>
  );
}

/** Admin: waiting suggestions, with the emoji's meanings now, to reword and approve or decline. */
export function MeaningProposalsAdmin() {
  const t = useT();
  const [items, setItems] = useState<MeaningProposalQueueItem[] | null>(null);
  const [words, setWords] = useState<Record<string, { label: string; neutral: string; replaces: string | null }>>({});
  const [note, setNote] = useState<string | null>(null);
  const load = () => api.admin.meaningProposals().then((r) => setItems(r.proposals), (e) => setNote((e as Error).message));
  useEffect(() => {
    load();
  }, []);
  if (!items) return note ? <Text style={type.small}>{note}</Text> : null;
  if (!items.length) return <Text style={type.small}>{t('meaningProposals.adminEmpty')}</Text>;

  const decide = (id: string, approve: boolean) => {
    const w = words[id];
    api.admin
      .decideMeaningProposal(id, { approve, ...(w?.label ? { label: w.label } : {}), ...(w?.neutral ? { neutralLabel: w.neutral } : {}), ...(w?.replaces ? { replaces: w.replaces } : {}) })
      .then(() => {
        setNote(null);
        load();
      }, (e) => setNote((e as Error).message));
  };

  return (
    <View style={{ gap: space.sm }} testID="meaning-proposals-admin">
      {items.map((p) => {
        const w = words[p.id] ?? { label: '', neutral: '', replaces: null };
        const edit = (patch: Partial<typeof w>) => setWords((s) => ({ ...s, [p.id]: { ...w, ...patch } }));
        return (
          <View key={p.id} style={styles.card}>
            <Text style={type.body}>
              {p.icon} “{p.label}”
            </Text>
            <Text style={type.small}>{t('meaningProposals.adminNow', { list: p.current.map((c) => c.label).join(' · ') })}</Text>
            <Field label={t('meaningProposals.adminLabel')} placeholder={p.label} value={w.label} onChangeText={(v) => edit({ label: v })} maxLength={40} />
            <Field label={t('meaningProposals.adminNeutral')} placeholder={w.label || p.label} value={w.neutral} onChangeText={(v) => edit({ neutral: v })} maxLength={40} />
            {p.current.length >= 5 ? (
              <>
                <Text style={type.small}>{t('meaningProposals.adminReplaces')}</Text>
                <View style={styles.row} role="radiogroup">
                  {p.current.map((c) => (
                    <Chip key={c.key} radio label={c.label} selected={w.replaces === c.key} onPress={() => edit({ replaces: c.key })} />
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.row}>
              <Button small label={t('meaningProposals.approve')} disabled={p.current.length >= 5 && !w.replaces} onPress={() => decide(p.id, true)} />
              <Button small variant="secondary" label={t('meaningProposals.decline')} onPress={() => decide(p.id, false)} />
            </View>
          </View>
        );
      })}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
