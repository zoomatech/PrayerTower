// Cross-posting: the member's own Facebook and Threads posts appear on their
// account here too. Shown on Me only while switched on (Admin → Notebook ideas).
// Two ways in: the browser extension (needs a key made here) and connecting
// the account itself (needs the server's Meta app keys).
import { POST_TYPE_LABELS } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Loading, Screen, Toggle } from '@/components/ui';
import { api, type CrosspostSource, type CrosspostStatus } from '@/lib/api';
import { env } from '@/lib/env';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const NAMES: Record<CrosspostSource, string> = { facebook: 'Facebook', threads: 'Threads' };

export default function Crosspost() {
  const { t, label } = useLocale();
  const [s, setS] = useState<CrosspostStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.crosspost.status().then(setS, (e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  const run = (p: Promise<unknown>) => p.then(load, (e) => setError((e as Error).message));
  const connect = (provider: CrosspostSource) =>
    api.crosspost
      .connect(provider)
      .then((r) => WebBrowser.openBrowserAsync(r.url))
      .then(load, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('crosspost.title')}</Text>
        <Text style={type.body}>{t('crosspost.intro')}</Text>
        <ErrorText error={error} onRetry={load} />
        {!s && !error ? <Loading /> : null}
        {s && !s.enabled ? <Text style={type.body}>{t('crosspost.off')}</Text> : null}
        {s?.enabled ? (
          <>
            <View style={styles.card}>
              <Text style={type.heading}>{t('crosspost.extensionTitle')}</Text>
              <Text style={type.body}>{t('crosspost.extensionBody')}</Text>
              <Text style={type.small}>{t('crosspost.extensionSteps', { server: env.apiUrl })}</Text>
              {key ? (
                <View style={styles.key}>
                  <Text style={type.small}>{t('crosspost.keyOnce')}</Text>
                  <Text selectable style={styles.keyText} accessibilityLabel={t('crosspost.keyLabel')}>
                    {key}
                  </Text>
                  <Button small variant="secondary" label={t('crosspost.shareKey')} onPress={() => Share.share({ message: key })} />
                </View>
              ) : s.extensionKeyHint ? (
                <Text style={type.small}>{t('crosspost.keyInUse', { hint: s.extensionKeyHint })}</Text>
              ) : null}
              <View style={styles.row}>
                <Button small label={s.extensionKeyHint ? t('crosspost.newKey') : t('crosspost.makeKey')} onPress={() => api.crosspost.newKey().then((r) => (setKey(r.key), load()), (e) => setError((e as Error).message))} />
                {s.extensionKeyHint ? <Button small variant="ghost" label={t('crosspost.revokeKey')} onPress={() => (setKey(null), run(api.crosspost.revokeKey()))} /> : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={type.heading}>{t('crosspost.accountsTitle')}</Text>
              <Text style={type.body}>{t('crosspost.accountsBody')}</Text>
              {(['threads', 'facebook'] as const).map((p) => {
                const account = s.accounts.find((a) => a.provider === p);
                return (
                  <View key={p} style={styles.provider}>
                    <Text style={styles.name}>{NAMES[p]}</Text>
                    {account ? (
                      <>
                        <Text style={type.small}>
                          {account.status === 'expired'
                            ? t('crosspost.expired')
                            : t('crosspost.connectedAs', { name: account.username ?? NAMES[p] })}
                        </Text>
                        <View style={styles.row}>
                          {account.status === 'expired' ? <Button small label={t('crosspost.reconnect')} onPress={() => connect(p)} /> : null}
                          <Button small variant="ghost" label={t('crosspost.disconnect', { name: NAMES[p] })} onPress={() => run(api.crosspost.disconnect(p))} />
                        </View>
                      </>
                    ) : s.connectable[p] ? (
                      <Button small label={t('crosspost.connect', { name: NAMES[p] })} onPress={() => connect(p)} />
                    ) : (
                      <Text style={type.small}>{t('crosspost.notReady', { name: NAMES[p] })}</Text>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Toggle label={t('crosspost.paused')} hint={t('crosspost.pausedHint')} value={s.paused} onChange={(v) => run(api.crosspost.update({ paused: v }))} />
              <Text style={type.small}>{t('crosspost.postAs')}</Text>
              <View style={styles.row}>
                {s.postTypes.map((pt) => (
                  <Chip key={pt} radio label={label('postType', pt, POST_TYPE_LABELS[pt])} selected={(s.postType ?? defaultType(s.postTypes)) === pt} onPress={() => run(api.crosspost.update({ postType: pt }))} />
                ))}
              </View>
            </View>

            <Text style={type.heading}>{t('crosspost.recent')}</Text>
            {s.recent.length === 0 ? <Text style={type.small}>{t('crosspost.none')}</Text> : null}
            {s.recent.map((r, i) => (
              <View key={`${r.createdAt}-${i}`} style={styles.recent}>
                <Text style={type.small}>
                  {new Date(r.createdAt).toLocaleString()} · {NAMES[r.source]} · {r.status === 'posted' ? t('crosspost.copied') : t('crosspost.skipped', { reason: r.reason ?? '' })}
                </Text>
                {r.postId ? <Button small variant="ghost" label={t('crosspost.open')} onPress={() => router.push(`/post/${r.postId}`)} /> : null}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** The server's default when the member hasn't chosen: discussion, else testimony, else praise. */
function defaultType(types: CrosspostStatus['postTypes']) {
  return types.find((x) => x === 'discussion') ?? types.find((x) => x === 'testimony') ?? types.find((x) => x === 'praise') ?? types[0];
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  provider: { gap: space.xs, paddingTop: space.sm },
  name: { ...type.body, fontWeight: '700' },
  key: { gap: space.xs },
  keyText: { ...type.body, fontFamily: 'monospace', color: colors.primary },
  recent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.xs },
});
