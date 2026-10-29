// Tells the member when they're offline, what is waiting to send, and anything
// the server turned down once it was sent.
import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '@/lib/i18n';
import { dismissDropped, useOffline } from '@/lib/offline';
import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

export function OfflineBanner({ savedAt, onRetry }: { savedAt?: number | null; onRetry?: () => void }) {
  const { online, queued, dropped } = useOffline();
  const { t, n } = useLocale();
  if (online && !queued.length && !dropped.length && !savedAt) return null;
  const waiting = queued.length
    ? ` ${queued.length === 1 ? t('offline.waitingOne') : t('offline.waitingMany', { count: queued.length })}`
    : '';
  return (
    <View style={styles.box} role="status" aria-live="polite">
      {!online || savedAt ? (
        <Text style={type.body}>
          {t('offline.notice')}
          {savedAt ? ` ${t('offline.saved', { when: new Date(savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) })}` : ''}
          {waiting}
        </Text>
      ) : queued.length ? (
        <Text style={type.body}>{t('offline.sending')}</Text>
      ) : null}
      {dropped.map((d, i) => (
        <Text key={i} style={type.small}>
          {t('offline.notSent', { what: `${n(d.label)}: ${d.message}` })}
        </Text>
      ))}
      {dropped.length ? <Button small variant="ghost" label={t('offline.ok')} onPress={dismissDropped} /> : null}
      {savedAt && onRetry ? <Button small variant="ghost" label={t('offline.retry')} onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: space.md, gap: space.xs },
});
