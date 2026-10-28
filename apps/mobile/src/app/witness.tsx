// Witness team (notebook Page 3: "resource managers will scan for sincere
// prayers and reach out"; Business Plan 6.4). Staff only: needs they marked
// as sincere, private notes, and a log of help sent. Nothing here is shown
// to the person being helped.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api, type WitnessCase, type WitnessStatus } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

const STATUS_LABELS: Record<WitnessStatus, string> = {
  watching: 'Watching',
  reaching_out: 'Reaching out',
  helped: 'Helped',
  closed: 'Closed',
};

export default function Witness() {
  const [filter, setFilter] = useState<WitnessStatus | null>(null);
  const [cases, setCases] = useState<WitnessCase[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ id: string; body: string; helpKind: string | null; author: string; createdAt: string }[]>([]);
  const [note, setNote] = useState('');
  const [helpKind, setHelpKind] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCases((await api.witnessCases(filter ?? undefined)).cases);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const expand = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    setNotes((await api.witnessNotes(id)).notes);
  };

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
      if (open) setNotes((await api.witnessNotes(open)).notes);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={type.title}>Witness team</Text>
        <Text style={type.body}>Needs marked as sincere, from a request's page. Notes stay inside the team.</Text>
        <View style={styles.row}>
          <Chip label="Open" selected={filter === null} onPress={() => setFilter(null)} />
          {(Object.keys(STATUS_LABELS) as WitnessStatus[]).map((s) => (
            <Chip key={s} label={STATUS_LABELS[s]} selected={filter === s} onPress={() => setFilter(s)} />
          ))}
        </View>
        <ErrorText error={error} />
        {cases.length === 0 ? <Empty text="No needs here yet. Open a request and mark it as a sincere need." /> : null}
        {cases.map((c) => (
          <View key={c.id} style={styles.card}>
            <Text style={type.small}>
              {STATUS_LABELS[c.status]} · {c.posterName}
              {c.anonymousPost ? ' (posted anonymously)' : ''}
              {c.assignedTo ? ` · with ${c.assignedTo}` : ''}
              {c.helpCount ? ` · help sent ${c.helpCount}×` : ''}
            </Text>
            <Text style={type.body} numberOfLines={open === c.id ? undefined : 3} onPress={() => router.push(`/post/${c.postId}`)}>
              {c.postBody}
            </Text>
            {c.lastNote && open !== c.id ? <Text style={type.small}>Last note: {c.lastNote}</Text> : null}
            <View style={styles.row}>
              <Button small variant="secondary" label={open === c.id ? 'Hide notes' : 'Notes'} onPress={() => expand(c.id)} />
              {c.status === 'watching' ? (
                <Button small variant="secondary" label="I'll reach out" onPress={() => run(() => api.witnessUpdate(c.id, { status: 'reaching_out', assignToMe: true }))} />
              ) : null}
              {c.status !== 'closed' ? <Button small variant="ghost" label="Close" onPress={() => run(() => api.witnessUpdate(c.id, { status: 'closed' }))} /> : null}
            </View>
            {open === c.id ? (
              <View style={styles.notes}>
                {notes.map((n) => (
                  <Text key={n.id} style={type.body}>
                    <Text style={styles.noteAuthor}>{n.author}: </Text>
                    {n.helpKind ? <Text style={styles.help}>[Help sent: {n.helpKind}] </Text> : null}
                    {n.body}
                  </Text>
                ))}
                <Field placeholder="Add a note" value={note} onChangeText={setNote} maxLength={2000} multiline />
                <Field placeholder="Help sent (groceries, rent, a visit…), if any" value={helpKind} onChangeText={setHelpKind} maxLength={60} />
                <Button
                  small
                  label={helpKind.trim() ? 'Log help sent' : 'Add note'}
                  disabled={!note.trim()}
                  onPress={() =>
                    run(async () => {
                      await api.witnessNote(c.id, note.trim(), helpKind.trim() || undefined);
                      setNote('');
                      setHelpKind('');
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  notes: { gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  noteAuthor: { fontWeight: '700' },
  help: { color: colors.primary, fontWeight: '700' },
});
