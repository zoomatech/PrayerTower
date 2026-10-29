// Donated token pools: start a pool others draw from to help requests reach
// more people, and manage your own. Pools carry no links or ads.
import { PRAYER_REALM_LABELS, PRAYER_REALMS, type PrayerRealm } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Empty, ErrorText, Field, Loading, Screen, Toggle } from '@/components/ui';
import { api, type TokenPool } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function PoolsScreen() {
  const { t, label, n } = useLocale();
  const [mine, setMine] = useState<TokenPool[]>([]);
  const [open, setOpen] = useState<TokenPool[]>([]);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [realm, setRealm] = useState<PrayerRealm | null>(null);
  const [amount, setAmount] = useState('');
  const [drawAmount, setDrawAmount] = useState('5');
  const [showDonor, setShowDonor] = useState(false);
  const [added, setAdded] = useState<Record<string, string>>({});
  const { poolMatching } = useFeatures();
  const [matchRatio, setMatchRatio] = useState('0');
  const [matchCap, setMatchCap] = useState('');
  const [thanks, setThanks] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, o, t] = await Promise.all([api.myTokenPools(), api.tokenPools(), api.tokens()]);
      setMine(m.pools);
      setOpen(o.pools.filter((p) => !p.isMine));
      setBalance(t.balance);
      setLoaded(true);
      setError(null);
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
      const pledge = poolMatching && Number(matchRatio) > 0 ? { matchRatio: Number(matchRatio), matchCap: Number(matchCap) } : {};
      await api.createTokenPool({ name: name.trim(), purpose: purpose.trim(), realm, drawAmount: Number(drawAmount), showDonor, amount: Number(amount), ...pledge });
      setName('');
      setMatchRatio('0');
      setMatchCap('');
      setPurpose('');
      setAmount('');
    });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.pools')}</Text>
        <Text style={type.body}>
          {t('pools.intro')}
        </Text>
        <ErrorText error={error} onRetry={loaded ? undefined : load} />
        {thanks ? <Text style={type.small} accessibilityLiveRegion="polite">{thanks}</Text> : null}
        {!loaded && !error ? <Loading /> : null}

        {/* Nothing below until the pools and the balance have loaded, so a slow or failed load never shows "You have 0 tokens". */}
        {loaded ? (
          <>
            <View style={styles.card}>
              <Text style={type.heading}>{t('pools.start')}</Text>
              <Text style={type.small}>{t('pools.youHave', { count: balance })}</Text>
              {balance === 0 ? <Text style={type.small}>{n('Each prayer you offer for someone else earns a token.')}</Text> : null}
              <Field label={t('pools.name')} value={name} onChangeText={setName} maxLength={60} placeholder={t('pools.namePlaceholder')} />
              <Field label={t('pools.purpose')} value={purpose} onChangeText={setPurpose} maxLength={280} multiline />
              <Text style={type.small}>{t('pools.onlyFor')}</Text>
              <View style={styles.chips}>
                {PRAYER_REALMS.map((r) => (
                  <Chip key={r} label={label('prayerRealm', r, PRAYER_REALM_LABELS[r])} selected={realm === r} onPress={() => setRealm(realm === r ? null : r)} />
                ))}
              </View>
              <Field label={t('pools.amount')} value={amount} onChangeText={setAmount} keyboardType="number-pad" maxLength={7} />
              <Field label={t('pools.drawAmount')} value={drawAmount} onChangeText={setDrawAmount} keyboardType="number-pad" maxLength={4} />
              <Toggle label={t('pools.showName')} value={showDonor} onChange={setShowDonor} />
              {poolMatching ? (
                <>
                  <Field label={t('pools.matchRatio')} value={matchRatio} onChangeText={setMatchRatio} keyboardType="number-pad" maxLength={1} />
                  {Number(matchRatio) > 0 ? <Field label={t('pools.matchCap')} value={matchCap} onChangeText={setMatchCap} keyboardType="number-pad" maxLength={7} /> : null}
                </>
              ) : null}
              <Button
                label={t('pools.create')}
                busy={busy}
                disabled={!name.trim() || !(Number(amount) > 0) || !(Number(drawAmount) > 0) || (poolMatching && Number(matchRatio) > 0 && !(Number(matchCap) > 0))}
                onPress={create}
              />
            </View>

            <Text style={type.heading}>{t('pools.yours')}</Text>
            {mine.length === 0 ? <Empty text={t('pools.noneMine')} /> : null}
            {mine.map((p) => (
              <View key={p.id} style={styles.card}>
                <Text style={styles.name}>{p.open ? p.name : t('pools.closed', { name: p.name })}</Text>
                {p.purpose ? <Text style={type.body}>{p.purpose}</Text> : null}
                <Text style={type.small}>
                  {t('pools.left', { count: p.balance, per: p.drawAmount })}{p.realm ? ` · ${t('pools.only', { realm: label('prayerRealm', p.realm, PRAYER_REALM_LABELS[p.realm as PrayerRealm]) })}` : ''}
                </Text>
                {p.match ? <Text style={type.small}>{t('pools.matching', p.match)} {t('pools.shareBack')}</Text> : null}
                {p.open ? (
                  <View style={styles.chips}>
                    <Field
                      placeholder={t('pools.addTokens')}
                      value={added[p.id] ?? ''}
                      onChangeText={(v) => setAdded((s) => ({ ...s, [p.id]: v }))}
                      keyboardType="number-pad"
                      maxLength={7}
                    />
                    <Button
                      small
                      variant="secondary"
                      label={t('pools.add')}
                      disabled={!(Number(added[p.id]) > 0)}
                      onPress={() => act(() => api.fundTokenPool(p.id, Number(added[p.id])).then(() => setAdded((s) => ({ ...s, [p.id]: '' }))))}
                    />
                    <Button small variant="ghost" label={t('pools.close')} onPress={() => act(() => api.closeTokenPool(p.id))} />
                  </View>
                ) : null}
              </View>
            ))}

            <Text style={type.heading}>{t('pools.open')}</Text>
            {open.length === 0 ? <Empty text={t('pools.noneOpen')} /> : null}
            {open.map((p) => (
              <View key={p.id} style={styles.card}>
                <Text style={styles.name}>{p.name}</Text>
                {p.purpose ? <Text style={type.body}>{p.purpose}</Text> : null}
                <Text style={type.small}>
                  {p.donor ? `${t('pools.from', { name: p.donor })} · ` : ''}
                  {t('pools.left', { count: p.balance, per: p.drawAmount })}. {t('pools.howToUse')}
                </Text>
                {p.match ? (
                  <>
                    <Text style={type.small}>{t('pools.matching', p.match)}</Text>
                    <Text style={type.small}>{t('pools.shareBack')}</Text>
                    <View style={styles.chips}>
                      <Field
                        placeholder={t('pools.addTokens')}
                        value={added[p.id] ?? ''}
                        onChangeText={(v) => setAdded((s) => ({ ...s, [p.id]: v }))}
                        keyboardType="number-pad"
                        maxLength={7}
                      />
                      <Button
                        small
                        variant="secondary"
                        label={t('pools.give')}
                        disabled={!(Number(added[p.id]) > 0)}
                        onPress={() =>
                          act(async () => {
                            const r = await api.fundTokenPool(p.id, Number(added[p.id]));
                            setAdded((s) => ({ ...s, [p.id]: '' }));
                            setThanks(t('pools.gave', { matched: r.matched }));
                          })
                        }
                      />
                    </View>
                  </>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
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
