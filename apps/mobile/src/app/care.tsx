// Talk to a prayer partner or pastor (notebook Page 4: "trained, personal
// pastors & counselors & prayer partners available to pray"). Members ask;
// staff with those roles see the queue here and reach out.
import { CARE_KIND_LABELS, type CareKind, type CareQueueItem, type CareRequest } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CrisisSupport } from '@/components/crisis';
import { Button, Chip, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius, space, type } from '@/lib/theme';

const STATUS = { open: 'Waiting for a prayer partner', claimed: 'Someone is with you', closed: 'Closed' } as const;

export default function Care() {
  const { roles } = useAuth();
  const staff = roles.some((r) => r === 'prayer_partner' || r === 'pastor_counselor');
  const [kinds, setKinds] = useState<CareKind[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [kind, setKind] = useState<CareKind>('pray_with_me');
  const [body, setBody] = useState('');
  const [mine, setMine] = useState<CareRequest[]>([]);
  const [queue, setQueue] = useState<CareQueueItem[]>([]);
  const [crisis, setCrisis] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, m] = await Promise.all([api.care(), api.myCareRequests()]);
      setEnabled(o.enabled);
      setKinds(o.kinds);
      setMine(m.requests);
      if (staff) setQueue((await api.careQueue()).requests);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [staff]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.askForCare(kind, body.trim());
      setCrisis(r.crisis);
      setSent(true);
      setBody('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const claim = async (id: string) => {
    try {
      const r = await api.claimCare(id);
      router.push(`/conversation/${r.conversationId}`);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
        <Text style={type.title}>Pray with someone</Text>
        <Text style={type.body}>Ask, and one of our prayer partners or pastors will reach out to you privately to pray with you.</Text>
        <ErrorText error={error} />
        {crisis ? <CrisisSupport /> : null}

        {!enabled ? (
          <Text style={type.small}>Prayer partners aren't available right now. Please try again later.</Text>
        ) : sent ? (
          <View style={styles.card}>
            <Text style={type.heading}>Your request is in</Text>
            <Text style={type.body}>A prayer partner will message you. You'll get a notice when they do.</Text>
            <Button small variant="ghost" label="Ask for something else" onPress={() => setSent(false)} />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              {kinds.map((k) => (
                <Chip key={k} label={CARE_KIND_LABELS[k]} selected={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <Field placeholder="What would you like prayer for?" value={body} onChangeText={setBody} maxLength={2000} multiline />
            <Button label="Ask for a prayer partner" onPress={ask} busy={busy} disabled={!body.trim()} />
          </View>
        )}

        {mine.length ? <Text style={type.heading}>Your requests</Text> : null}
        {mine.map((r) => (
          <View key={r.id} style={styles.card}>
            <Text style={type.small}>
              {CARE_KIND_LABELS[r.kind]} · {STATUS[r.status]}
            </Text>
            <Text style={type.body} numberOfLines={3}>
              {r.body}
            </Text>
            <View style={styles.row}>
              {r.conversationId ? <Button small label="Open conversation" onPress={() => router.push(`/conversation/${r.conversationId}`)} /> : null}
              {r.status !== 'closed' ? <Button small variant="ghost" label="Close" onPress={() => api.closeCare(r.id).then(load).catch((e) => setError((e as Error).message))} /> : null}
            </View>
          </View>
        ))}

        {staff ? (
          <>
            <Text style={type.heading}>Care queue</Text>
            {queue.length === 0 ? <Text style={type.small}>No one is waiting right now.</Text> : null}
            {queue.map((r) => (
              <View key={r.id} style={[styles.card, r.crisis && styles.crisis]}>
                <Text style={type.small}>
                  {r.crisis ? 'May be in danger · ' : ''}
                  {CARE_KIND_LABELS[r.kind]} · {r.name} · {new Date(r.createdAt).toLocaleString()}
                </Text>
                <Text style={type.body}>{r.body}</Text>
                <Button small label="Reach out" onPress={() => claim(r.id)} />
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  crisis: { borderColor: colors.danger },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
