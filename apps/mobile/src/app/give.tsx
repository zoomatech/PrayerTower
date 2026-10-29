// Give: gifts instead of ads. Shown only while an admin has turned giving on and
// set up Stripe, a Zeffy link or a PayPal link. A gift goes to everyone (the shared fund) or a
// token pool. Also shows this month's free radio prayers and asks for more.
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type GiftTarget, type GivingInfo, type MyGift, type RadioAllowance, type TokenPool } from '@/lib/api';
import { useFeature } from '@/lib/community-features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const AMOUNTS = [500, 1000, 2500, 5000];

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export default function GiveScreen() {
  const { t } = useLocale();
  const radioOn = useFeature('radio');
  const params = useLocalSearchParams<{ thanks?: string; to?: string; name?: string }>();
  const [info, setInfo] = useState<GivingInfo | null>(null);
  const [pools, setPools] = useState<TokenPool[]>([]);
  const [gifts, setGifts] = useState<MyGift[]>([]);
  const [allowance, setAllowance] = useState<RadioAllowance | null>(null);
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState('');
  // From a member's page (Give to …), the gift starts out going to them.
  const [target, setTarget] = useState<GiftTarget>(params.to ? { kind: 'member', userId: params.to } : { kind: 'everyone' });
  const [showDonor, setShowDonor] = useState(false);
  const [ask, setAsk] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(params.thanks ? t('give.thanks') : null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.givingInfo().then((i) => (setInfo(i), setError(null)), (e) => setError((e as Error).message));
    api.tokenPools().then((r) => setPools(r.pools), () => undefined);
    api.myGifts().then((r) => setGifts(r.donations), () => undefined);
    api.radioAllowance().then(setAllowance, () => undefined);
  }, []);
  useEffect(load, [load]);

  const cents = custom.trim() ? Math.round(Number(custom.replace(/[$,]/g, '')) * 100) : amount;
  const amountOk = info ? Number.isFinite(cents) && cents >= info.minCents && cents <= info.maxCents : false;

  const give = async () => {
    if (!info) return;
    setError(null);
    setNotice(null);
    try {
      if (info.provider === 'zeffy' && info.url) {
        await WebBrowser.openBrowserAsync(info.url);
        return;
      }
      setBusy(true);
      const out = await api.giveCheckout(cents, target, showDonor);
      await WebBrowser.openBrowserAsync(out.url);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const askForMore = async () => {
    setError(null);
    try {
      await api.askForRadioPrayers(Math.max(1, Math.round(Number(ask)) || 1), note.trim());
      setNotice(t('give.asked'));
      setNote('');
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('give.title')}</Text>
        <ErrorText error={error} onRetry={info ? undefined : load} />
        {!info && !error ? <Loading /> : null}
        {notice ? <Text style={[type.body, { color: colors.goldText }]}>{notice}</Text> : null}
        {info && !info.enabled ? <Text style={type.body}>{t('give.off')}</Text> : null}

        {info?.enabled ? (
          <View style={styles.card}>
            <Text style={type.body}>{t('give.intro')}</Text>
            {info.provider === 'stripe' ? (
              <>
                <Text style={type.heading}>{t('give.amount')}</Text>
                <View style={styles.chips}>
                  {AMOUNTS.filter((a) => a >= info.minCents && a <= info.maxCents).map((a) => (
                    <Chip key={a} label={dollars(a)} selected={!custom.trim() && amount === a} onPress={() => (setCustom(''), setAmount(a))} />
                  ))}
                </View>
                <Field label={t('give.other')} value={custom} onChangeText={setCustom} keyboardType="decimal-pad" testID="give-other" />
                <Text style={type.heading}>{t('give.to')}</Text>
                <View style={styles.chips}>
                  <Chip label={t('give.everyone')} selected={target.kind === 'everyone'} onPress={() => setTarget({ kind: 'everyone' })} />
                  {params.to ? (
                    <Chip label={params.name ?? t('give.member')} selected={target.kind === 'member'} onPress={() => setTarget({ kind: 'member', userId: params.to! })} />
                  ) : null}
                  {pools.map((p) => (
                    <Chip key={p.id} label={p.name} selected={target.kind === 'pool' && target.poolId === p.id} onPress={() => setTarget({ kind: 'pool', poolId: p.id })} />
                  ))}
                </View>
                <Chip label={t('give.showName')} selected={showDonor} onPress={() => setShowDonor(!showDonor)} />
                <Text style={type.small}>{t('give.fees')}</Text>
              </>
            ) : null}
            {info.provider !== 'none' ? (
              <Button
                testID="give-submit"
                label={info.provider === 'stripe' ? t('give.giveAmount', { amount: amountOk ? dollars(cents) : '' }) : t('give.open')}
                onPress={give}
                busy={busy}
                disabled={info.provider === 'stripe' && !amountOk}
              />
            ) : null}
            {/* PayPal's own Donate page, a second way to give; staff record those gifts. */}
            {info.paypalUrl ? (
              <Button
                testID="give-paypal"
                variant={info.provider === 'none' ? 'primary' : 'secondary'}
                label={t('give.paypal')}
                onPress={() => WebBrowser.openBrowserAsync(info.paypalUrl!).catch((e) => setError((e as Error).message))}
              />
            ) : null}
          </View>
        ) : null}

        {radioOn && allowance?.enabled ? (
          <View style={styles.card}>
            <Text style={type.heading}>{t('give.radioTitle')}</Text>
            <Text style={type.body}>{t('give.radioFree', { count: allowance.freeThisMonth })}</Text>
            {allowance.granted ? <Text style={type.body}>{t('give.radioGranted', { count: allowance.granted })}</Text> : null}
            {allowance.pendingRequest ? <Text style={type.small}>{t('give.radioPending', { count: allowance.pendingRequest })}</Text> : null}
            {allowance.canRequest ? (
              <>
                <Field label={t('give.radioHowMany', { max: allowance.maxPerRequest })} value={ask} onChangeText={setAsk} keyboardType="number-pad" testID="give-ask-count" />
                <Field label={t('give.radioWhy')} value={note} onChangeText={setNote} maxLength={500} multiline testID="give-ask-note" />
                <Button small variant="secondary" label={t('give.radioAsk')} onPress={askForMore} disabled={!(Number(ask) >= 1 && Number(ask) <= allowance.maxPerRequest)} />
              </>
            ) : null}
          </View>
        ) : null}

        {gifts.length ? (
          <>
            <Text style={type.heading}>{t('give.history')}</Text>
            {gifts.map((g) => (
              <Text key={g.id} style={type.small}>
                {new Date(g.created_at).toLocaleDateString()} · {dollars(g.amount_cents)} · {t(`give.status.${g.status}`)}
              </Text>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
