// My signal queue (docs/STATION_OPERATOR_GUIDE.md, "My signal queue"), from the
// first prototype's Signal Queue tab: the member's own radio prayers, with where
// each one is and, once it went out, its signal code. A listener who decodes the
// same prayer sees the same code on the Listen screen. Off with the admin's switch.
// With Signal journey on, each one that went out also shows how far its wave has gone.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SignalJourney } from '@/components/signal-journey';
import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, ApiError, type SignalEntry } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function SignalQueueScreen() {
  const { t } = useLocale();
  const [items, setItems] = useState<SignalEntry[] | null>(null);
  const [off, setOff] = useState(false);
  const [journey, setJourney] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.signalQueue().then(
      (r) => (setItems(r.signals), setJourney(r.journey === true), setError(null)),
      (e) => (e instanceof ApiError && e.status === 404 ? setOff(true) : setError((e as Error).message)),
    );
  }, []);
  useEffect(load, [load]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('signalQueue.title')}</Text>
        {off ? <Empty text={t('signalQueue.off')} /> : <Text style={type.body}>{t('signalQueue.intro')}</Text>}
        <ErrorText error={error} onRetry={items ? undefined : load} />
        {!items && !error && !off ? <Loading /> : null}
        {items?.length === 0 ? <Empty text={t('signalQueue.empty')} /> : null}
        {items?.map((s) => (
          <View key={s.id} style={styles.card}>
            <Text style={type.body} accessibilityRole="link" onPress={() => router.push(`/post/${s.postId}`)}>
              “{s.excerpt}”
            </Text>
            <Text style={type.small}>
              {t(`signalQueue.status.${s.status}`)}
              {s.amplified ? ` · ${t('signalQueue.amplified')}` : ''}
              {s.amplified && s.copies ? ` · ${t('signalQueue.copies', { count: s.copies })}` : ''}
              {s.kind === 'thanksgiving' ? ` · ${t('signalQueue.thanksgiving')}` : ''}
              {s.kind === 'auto' ? ` · ${t('signalQueue.auto')}` : ''}
              {` · ${when(s.sentAt ?? s.queuedAt)}`}
              {s.callSign ? ` · ${s.callSign}` : ''}
              {s.preset ? ` · ${s.preset}` : ''}
            </Text>
            {s.signalCode ? (
              <Text style={styles.code} accessibilityLabel={t('signalQueue.codeLabel', { code: s.signalCode.split('').join(' ') })}>
                {s.signalCode}
              </Text>
            ) : null}
            {s.heardCount ? <Text style={type.small}>{t('signalQueue.heard', { count: s.heardCount })}</Text> : null}
            {journey && s.status === 'sent' && s.sentAt ? <SignalJourney sentAt={s.sentAt} bestSnrDb={s.bestSnrDb} /> : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  code: { ...type.heading, fontFamily: 'Courier', letterSpacing: 2 },
});
