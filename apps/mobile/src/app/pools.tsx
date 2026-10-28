// Donated token pools: start a pool others draw from to help requests reach
// more people, and manage your own. Pools carry no links or ads.
import { PRAYER_REALM_LABELS, PRAYER_REALMS, type PrayerRealm } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api, type TokenPool } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function PoolsScreen() {
  const [mine, setMine] = useState<TokenPool[]>([]);
  const [open, setOpen] = useState<TokenPool[]>([]);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [realm, setRealm] = useState<PrayerRealm | null>(null);
  const [amount, setAmount] = useState('');
  const [drawAmount, setDrawAmount] = useState('5');
  const [showDonor, setShowDonor] = useState(false);
  const [added, setAdded] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [m, o, t] = await Promise.all([api.myTokenPools(), api.tokenPools(), api.tokens()]);
      setMine(m.pools);
      setOpen(o.pools.filter((p) => !p.isMine));
      setBalance(t.balance);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    act(async () => {
      await api.createTokenPool({ name: name.trim(), purpose: purpose.trim(), realm, drawAmount: Number(drawAmount), showDonor, amount: Number(amount) });
      setName('');
      setPurpose('');
      setAmount('');
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Token pools</Text>
        <Text style={type.body}>
          Put tokens in a pool, and other members can use them to help requests reach more people. Pools carry no links or ads, and you stay
          anonymous unless you choose to be named.
        </Text>
        <ErrorText error={error} />

        <View style={styles.card}>
          <Text style={type.heading}>Start a pool</Text>
          <Text style={type.small}>You have {balance} tokens.</Text>
          <Field label="Name" value={name} onChangeText={setName} maxLength={60} placeholder="e.g. For families in need" />
          <Field label="Purpose (optional)" value={purpose} onChangeText={setPurpose} maxLength={280} multiline />
          <Text style={type.small}>Only for (optional)</Text>
          <View style={styles.chips}>
            {PRAYER_REALMS.map((r) => (
              <Chip key={r} label={PRAYER_REALM_LABELS[r]} selected={realm === r} onPress={() => setRealm(realm === r ? null : r)} />
            ))}
          </View>
          <Field label="Tokens to put in" value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={7} />
          <Field label="Tokens each use gives a request" value={drawAmount} onChangeText={setDrawAmount} keyboardType="number-pad" maxLength={4} />
          <Toggle label="Show my name on this pool" value={showDonor} onChange={setShowDonor} />
          <Button label="Start pool" busy={busy} disabled={!name.trim() || !(Number(amount) > 0) || !(Number(drawAmount) > 0)} onPress={create} />
        </View>

        <Text style={type.heading}>Your pools</Text>
        {mine.length === 0 ? <Empty text="You haven't started a pool." /> : null}
        {mine.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.name}>
              {p.name}
              {p.open ? '' : ' (closed)'}
            </Text>
            {p.purpose ? <Text style={type.body}>{p.purpose}</Text> : null}
            <Text style={type.small}>
              {p.balance} tokens left · {p.drawAmount} per use{p.realm ? ` · ${PRAYER_REALM_LABELS[p.realm as PrayerRealm] ?? p.realm} only` : ''}
            </Text>
            {p.open ? (
              <View style={styles.chips}>
                <Field
                  placeholder="Add tokens"
                  value={added[p.id] ?? ''}
                  onChangeText={(v) => setAdded((s) => ({ ...s, [p.id]: v }))}
                  keyboardType="number-pad"
                  maxLength={7}
                />
                <Button
                  small
                  variant="secondary"
                  label="Add"
                  disabled={!(Number(added[p.id]) > 0)}
                  onPress={() => act(() => api.fundTokenPool(p.id, Number(added[p.id])).then(() => setAdded((s) => ({ ...s, [p.id]: '' }))))}
                />
                <Button small variant="ghost" label="Close and take back what's left" onPress={() => act(() => api.closeTokenPool(p.id))} />
              </View>
            ) : null}
          </View>
        ))}

        <Text style={type.heading}>Open pools</Text>
        {open.length === 0 ? <Empty text="No other pools yet." /> : null}
        {open.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={styles.name}>{p.name}</Text>
            {p.purpose ? <Text style={type.body}>{p.purpose}</Text> : null}
            <Text style={type.small}>
              {p.donor ? `From ${p.donor} · ` : ''}
              {p.balance} tokens left · {p.drawAmount} per use. Use it from Gift Tokens on any request.
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  name: { fontWeight: '700', color: colors.text, fontSize: 16 },
});
