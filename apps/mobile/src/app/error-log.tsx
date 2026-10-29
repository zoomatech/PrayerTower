// Admin → Error log (docs/PILOT_TOOLS.md): app crashes and the API's unexpected
// failures, one row per distinct error with how often it happened, while Admin →
// Pilot tools has the log on. Mark one fixed; it opens again if it comes back.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type ErrorReport } from '@/lib/api';
import { errorText } from '@/lib/error-report';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

type Status = 'open' | 'resolved' | 'all';

function ErrorLog() {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>('open');
  const [items, setItems] = useState<ErrorReport[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems((await api.admin.errors(status)).errors);
    } catch (e) {
      setError(errorText(e));
    }
  }, [status]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const resolve = (id: string) =>
    api.admin
      .resolveError(id)
      .then(load)
      .catch((e) => setError(errorText(e)));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title} accessibilityRole="header">
          {t('errorLog.title')}
        </Text>
        <Text style={type.small}>{t('errorLog.intro')}</Text>
        <View style={styles.row} role="group" aria-label={t('errorLog.show')}>
          {(['open', 'resolved', 'all'] as const).map((s) => (
            <Chip key={s} label={t(`errorLog.status.${s}`)} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
        <ErrorText error={error} onRetry={load} />
        {items === null && !error ? <Loading /> : null}
        {items?.length === 0 ? <Empty text={t('errorLog.none')} /> : null}
        {items?.map((e) => (
          <View key={e.id} style={styles.card}>
            <Text style={styles.message}>{e.message}</Text>
            <Text style={type.small}>
              {t('errorLog.where', { source: t(`errorLog.source.${e.source}`), place: e.place, count: e.count })}
            </Text>
            <Text style={type.small}>
              {t('errorLog.seen', { first: new Date(e.firstSeen).toLocaleString(), last: new Date(e.lastSeen).toLocaleString() })}
            </Text>
            {e.platform || e.appVersion ? <Text style={type.small}>{[e.platform, e.appVersion].filter(Boolean).join(' · ')}</Text> : null}
            {e.lastUser ? (
              <Button small variant="ghost" label={t('errorLog.lastUser', { name: e.lastUser.name })} onPress={() => router.push(`/people/${e.lastUser!.id}`)} />
            ) : null}
            {e.detail ? (
              <Button small variant="ghost" label={open === e.id ? t('errorLog.hideDetail') : t('errorLog.showDetail')} onPress={() => setOpen(open === e.id ? null : e.id)} />
            ) : null}
            {open === e.id && e.detail ? (
              <Text style={styles.detail} selectable>
                {e.detail}
              </Text>
            ) : null}
            {e.resolvedAt ? (
              <Text style={type.small}>{t('errorLog.resolved')}</Text>
            ) : (
              <Button small variant="secondary" label={t('errorLog.resolve')} onPress={() => void resolve(e.id)} />
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

export default staffOnly(ErrorLog, ['admin']);

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  message: { ...type.body, fontWeight: '600' },
  detail: { ...type.small, fontFamily: 'monospace' },
});
