// Admin → Background jobs: tasks still retrying, and jobs that ran out of tries
// (the dead-letter list), each with Retry and Discard. Admins are also alerted.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { api, type FailedJob, type RetryingTask } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

import { Button, ErrorText } from './ui';
import { errorText } from '@/lib/error-report';

export function JobsPanel() {
  const { t, language } = useLocale();
  const [failed, setFailed] = useState<FailedJob[]>([]);
  const [retrying, setRetrying] = useState<RetryingTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.jobs();
      setFailed(r.failed);
      setRetrying(r.retrying);
      setLoaded(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <View style={{ gap: space.sm }}>
      <Text style={type.heading}>{t('jobs.title')}</Text>
      <Text style={type.small}>{t('jobs.intro')}</Text>
      <ErrorText error={error} />
      {notice ? (
        <Text role="status" style={type.small}>
          {notice}
        </Text>
      ) : null}
      {loaded && !failed.length && !retrying.length ? <Text style={type.body}>{t('jobs.healthy')}</Text> : null}
      {retrying.map((r) => (
        <Text key={r.task} style={type.small}>
          {t('jobs.retrying', { task: r.task, count: r.jobs, attempts: r.attempts })}
          {r.lastError ? `: ${r.lastError}` : ''}
        </Text>
      ))}
      {failed.length ? <Text style={[type.body, { fontWeight: '700' }]}>{t('jobs.failed')}</Text> : null}
      {failed.map((j) => (
        <View key={j.id} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, gap: 4 }}>
          <Text style={[type.body, { fontWeight: '700' }]}>{j.task}</Text>
          <Text style={type.small}>{t('jobs.tries', { attempts: j.attempts, max: j.maxAttempts, date: when(j.failedAt) })}</Text>
          {j.lastError ? (
            <Text style={[type.small, { color: colors.danger }]} selectable>
              {j.lastError}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button small variant="secondary" label={t('jobs.retry', { task: j.task })} busy={busy === j.id} onPress={() => act(j.id, () => api.admin.retryJob(j.id), t('jobs.retried'))} />
            <Button small variant="ghost" label={t('jobs.discard', { task: j.task })} disabled={busy === j.id} onPress={() => act(j.id, () => api.admin.discardJob(j.id), t('jobs.discarded'))} />
          </View>
        </View>
      ))}
    </View>
  );
}
