// Admin → Audit log: every change staff made (roles, settings, moderation
// decisions, witness and care actions), newest first. Admins only.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api, type AuditEntry } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const PAGE = 50;
// 'PATCH /admin/token-settings' -> 'PATCH_admin_token-settings' (i18n keys can't hold '/' or ':').
const actionKey = (action: string) => action.replace(/[/:\s]+/g, '_');

export default function AuditLog() {
  const { t, language } = useLocale();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before?: string) => {
    try {
      const page = (await api.admin.auditLog({ before, limit: PAGE })).entries;
      setEntries((prev) => (before ? [...prev, ...page] : page));
      setMore(page.length === PAGE);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const details = (e: AuditEntry) => {
    const { id: _id, ...params } = e.params;
    const parts = [...Object.values(params), e.body ? JSON.stringify(e.body) : ''].filter(Boolean).join(' · ');
    return parts.length > 240 ? `${parts.slice(0, 237)}…` : parts;
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('auditLog.title')}</Text>
        <Text style={type.body}>{t('auditLog.intro')}</Text>
        <ErrorText error={error} />
        {entries.length === 0 && !error ? <Empty text={t('auditLog.empty')} /> : null}
        {entries.map((e) => (
          <View key={e.id} style={styles.card}>
            <Text style={type.small}>
              {when(e.created_at)} · {e.actor_name ?? t('auditLog.deleted')}
            </Text>
            <Text style={styles.action}>{t(`auditLog.action.${actionKey(e.action)}`, { defaultValue: e.action })}</Text>
            {e.target_id ? <Text style={type.small}>{t('auditLog.target', { id: e.target_id.slice(-8) })}</Text> : null}
            {details(e) ? <Text style={styles.details}>{details(e)}</Text> : null}
          </View>
        ))}
        {more ? <Button variant="secondary" label={t('auditLog.more')} onPress={() => load(entries.at(-1)?.created_at)} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 },
  action: { ...type.body, fontWeight: '700' },
  details: { ...type.small, color: colors.textMuted },
});
