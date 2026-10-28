// Admin → Operations: is the background worker running, is the job queue
// moving, any server errors, and is the radio station checking in. Refreshes
// every 30 seconds while open. Admins only (docs/MONITORING.md).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, ErrorText, Screen } from '@/components/ui';
import { api, type OpsStatus } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const REFRESH_MS = 30_000;

function Ops() {
  const { t, language } = useLocale();
  const [status, setStatus] = useState<OpsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus((await api.admin.ops()).status);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const s = status;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('ops.title')}</Text>
        <Text style={type.body}>{t('ops.intro')}</Text>
        <ErrorText error={error} />
        {s ? (
          <>
            <View style={[styles.card, s.problems.length ? styles.alert : styles.good]} role="status" aria-live="polite">
              {s.problems.length ? (
                s.problems.map((p) => (
                  <Text key={p} style={styles.strong}>
                    {t(`ops.problem.${p}`)}
                  </Text>
                ))
              ) : (
                <Text style={styles.strong}>{t('ops.allGood')}</Text>
              )}
              <Text style={type.small}>{t('ops.checked', { when: when(s.checkedAt) })}</Text>
            </View>

            <Section title={t('ops.server')}>
              <Text style={type.body}>{t('ops.database', { ms: s.database.ms })}</Text>
            </Section>

            <Section title={t('ops.worker')}>
              <Text style={[type.body, !s.worker.ok && styles.bad]}>{s.worker.ok ? t('ops.ok') : t('ops.down')}</Text>
              <Text style={type.small}>{s.worker.lastSeen ? t('ops.lastSeen', { when: when(s.worker.lastSeen) }) : t('ops.never')}</Text>
            </Section>

            <Section title={t('ops.queue')}>
              <Text style={type.body}>{t('ops.waiting', { count: s.queue.waiting })}</Text>
              <Text style={type.body}>{t('ops.running', { count: s.queue.running })}</Text>
              {s.queue.overdue ? <Text style={[type.body, styles.bad]}>{t('ops.overdue', { count: s.queue.overdue, seconds: s.queue.oldestOverdueSeconds })}</Text> : null}
              {s.queue.failed ? <Text style={[type.body, styles.bad]}>{t('ops.failed', { count: s.queue.failed })}</Text> : null}
              {s.queue.retrying ? <Text style={type.body}>{t('ops.retrying', { count: s.queue.retrying })}</Text> : null}
            </Section>

            <Section title={t('ops.errors')}>
              {s.errors.last24h ? (
                <>
                  <Text style={[type.body, s.errors.lastHour > 0 && styles.bad]}>{t('ops.errorCounts', { hour: s.errors.lastHour, day: s.errors.last24h })}</Text>
                  {s.errors.recent.map((e, i) => (
                    <Text key={`${e.at}-${i}`} style={type.small}>
                      {when(e.at)} · {e.status} · {e.method} {e.route}
                    </Text>
                  ))}
                </>
              ) : (
                <Text style={type.body}>{t('ops.noErrors')}</Text>
              )}
            </Section>

            <Section title={t('ops.radio')}>
              <Text style={type.body}>{t(`ops.mode.${s.radio.mode}`)}</Text>
              <Text style={type.body}>
                {t('ops.radioCounts', { queued: s.radio.queued, sending: s.radio.sending, sent: s.radio.sentToday, failed: s.radio.failedToday })}
              </Text>
              {s.radio.lastSentAt ? <Text style={type.small}>{t('ops.lastSent', { when: when(s.radio.lastSentAt) })}</Text> : null}
              <Text style={styles.label}>{t('ops.station')}</Text>
              {s.radio.station.ok === null ? (
                <Text style={type.small}>{t('ops.stationNotUsed')}</Text>
              ) : (
                <Text style={[type.body, !s.radio.station.ok && styles.bad]}>{s.radio.station.ok ? t('ops.ok') : t('ops.down')}</Text>
              )}
              {s.radio.station.ok !== null ? (
                <Text style={type.small}>{s.radio.station.lastSeen ? t('ops.lastSeen', { when: when(s.radio.station.lastSeen) }) : t('ops.never')}</Text>
              ) : null}
            </Section>
          </>
        ) : null}
        <Button variant="secondary" label={t('ops.refresh')} onPress={load} />
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={type.heading} role="heading">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 },
  good: { borderColor: colors.primary },
  alert: { borderColor: colors.danger, borderWidth: 2 },
  strong: { ...type.body, fontWeight: '700' },
  bad: { color: colors.danger, fontWeight: '700' },
  label: { ...type.body, fontWeight: '700', marginTop: space.sm },
});

export default staffOnly(Ops, ['admin']);
