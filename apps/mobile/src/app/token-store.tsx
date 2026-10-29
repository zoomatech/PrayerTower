// Buy tokens (App Store in-app purchase). Shown only while an admin has turned
// purchases on; the server checks every purchase with Apple before crediting it.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type TokenProduct, type TokenPurchase } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import * as store from '@/lib/token-store';

export default function TokenStoreScreen() {
  const { t } = useLocale();
  const { session } = useAuth();
  const [listing, setListing] = useState<{ enabled: boolean; commonFundPercent?: number; products: TokenProduct[]; practice?: boolean } | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [purchases, setPurchases] = useState<TokenPurchase[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.tokenStore().then((l) => (setListing(l), setError(null)), (e) => setError((e as Error).message));
    api.tokenPurchases().then((r) => setPurchases(r.purchases), () => {});
  }, []);
  useEffect(load, [load]);

  // Practice mode (Admin → Practice mode): no App Store, no money, works on any device.
  const practice = !!listing?.enabled && !!listing.practice;
  const ready = !!listing?.enabled && (store.storeAvailable || practice);
  useEffect(() => {
    if (!ready || practice) return;
    let stop: (() => void) | undefined;
    let live = true;
    store
      .connect({
        onCredited: (r) => {
          setBusy(null);
          setNotice(t('tokenStore.added', { count: r.tokens }));
          load();
        },
        onError: (message) => {
          setBusy(null);
          setError(message ? t('tokenStore.failed') : null);
        },
      })
      .then((s) => (live ? (stop = s) : s()))
      .then(() => store.prices(listing!.products.map((p) => p.appleProductId).filter((id): id is string => !!id)))
      .then((p) => live && p && setPrices(p))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
      stop?.();
    };
  }, [ready, practice, listing, load, t]);

  const buy = (p: TokenProduct) => {
    if (!p.appleProductId || !session) return;
    setBusy(p.sku);
    setNotice(null);
    setError(null);
    if (practice) {
      api
        .buyTokens(store.practiceTransaction(p.appleProductId, session.user.id))
        .then((r) => (setBusy(null), setNotice(t('tokenStore.practiceAdded', { count: r.purchase.tokens })), load()))
        .catch((e) => (setBusy(null), setError((e as Error).message)));
      return;
    }
    store.buy(p.appleProductId, session.user.id).catch((e) => (setBusy(null), setError((e as Error).message)));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('tokenStore.title')}</Text>
        <ErrorText error={error} onRetry={listing ? undefined : load} />
        {!listing && !error ? <Loading /> : null}
        {listing && !listing.enabled ? <Text style={type.body}>{t('tokenStore.off')}</Text> : null}
        {listing?.enabled && !ready ? <Text style={type.body}>{t('tokenStore.iosOnly')}</Text> : null}
        {practice ? <Text style={[type.body, { color: colors.goldText }]}>{t('tokenStore.practice')}</Text> : null}
        {ready ? (
          <>
            <Text style={type.body}>{t('tokenStore.intro', { percent: listing!.commonFundPercent ?? 0 })}</Text>
            {notice ? <Text style={[type.body, { color: colors.goldText }]}>{notice}</Text> : null}
            {listing!.products
              .filter((p) => p.appleProductId)
              .map((p) => (
                <View key={p.sku} style={styles.card}>
                  <Text style={type.heading}>{t(p.currency === 'priestly' ? 'tokenStore.priestly' : 'tokenStore.regular', { count: p.tokens })}</Text>
                  <Button
                    label={
                      busy === p.sku
                        ? t('tokenStore.finishing')
                        : practice
                          ? t('tokenStore.practiceBuy')
                          : t('tokenStore.buy', { price: prices[p.appleProductId!] ?? p.priceLabel ?? '' })
                    }
                    disabled={!!busy}
                    onPress={() => buy(p)}
                  />
                </View>
              ))}
          </>
        ) : null}
        {purchases.length ? (
          <>
            <Text style={type.heading}>{t('tokenStore.history')}</Text>
            {purchases.map((p) => (
              <Text key={p.id} style={type.small}>
                {p.purchased_at ? new Date(p.purchased_at).toLocaleDateString() : ''} · {t(p.currency === 'priestly' ? 'tokenStore.priestly' : 'tokenStore.regular', { count: p.tokens })}
                {p.status === 'refunded' ? ` · ${t('tokenStore.refunded')}` : ''}
                {p.practice ? ` · ${t('tokenStore.practiceLabel')}` : ''}
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
});
