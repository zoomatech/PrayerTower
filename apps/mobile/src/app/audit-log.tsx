// Admin → Audit log: every change staff made (roles, settings, moderation
// decisions, witness and care actions), newest first. Admins only.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api, type AuditEntry } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const PAGE = 50;
// 'PATCH /admin/token-settings' -> 'PATCH_admin_token-settings' (i18n keys can't hold '/' or ':').
const actionKey = (action: string) => action.replace(/[/:\s]+/g, '_');

function AuditLog() {
  const { t, language } = useLocale();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Moderation tools (off): words, moderation only, last 7 days.
  const { moderationTools } = useFeatures();
  const [words, setWords] = useState('');
  const [onlyModeration, setOnlyModeration] = useState(false);
  const [week, setWeek] = useState(false);
  const filters = moderationTools
    ? {
        q: words.trim() || undefined,
        action: onlyModeration ? ' /moderation/' : undefined,
        since: week ? new Date(Date.now() - 7 * 86_400_000).toISOString() : undefined,
      }
    : {};
  const filterKey = JSON.stringify([filters.action, filters.since ? 'week' : '']);

  const load = useCallback(async (after?: AuditEntry, applied: typeof filters = {}) => {
    try {
      // The last entry's time and id: entries sharing its time still come on the next page.
      const page = (await api.admin.auditLog({ before: after?.created_at, beforeId: after?.id, limit: PAGE, ...applied })).entries;
      setEntries((prev) => (after ? [...prev, ...page] : page));
      setMore(page.length === PAGE);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(undefined, filters);
      // Re-run when a chip changes; typed words wait for Search.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, filterKey, moderationTools]),
  );

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  const details = (e: AuditEntry) => {
    const { id: _id, ...params } = e.params;
    // Plain "key: value" pairs instead of raw JSON. Spanish copies (titleEs, bodyEs) and empty values are left out.
    const body = Object.entries(e.body && typeof e.body === 'object' ? (e.body as Record<string, unknown>) : {})
      .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !/Es$/.test(k))
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    const parts = [...Object.values(params), ...body].filter(Boolean).join(' · ');
    return parts.length > 240 ? `${parts.slice(0, 237)}…` : parts;
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('auditLog.title')}</Text>
        <Text style={type.body}>{t('auditLog.intro')}</Text>
        {moderationTools ? (
          <View style={styles.filters}>
            <Field
              label={t('auditLog.filterSearch')}
              placeholder={t('auditLog.filterHint')}
              value={words}
              onChangeText={setWords}
              onSubmitEditing={() => load(undefined, filters)}
            />
            <View style={styles.row}>
              <Chip label={t('auditLog.filterModeration')} selected={onlyModeration} onPress={() => setOnlyModeration((v) => !v)} />
              <Chip label={t('auditLog.filterWeek')} selected={week} onPress={() => setWeek((v) => !v)} />
              <Button small variant="secondary" label={t('auditLog.filterApply')} onPress={() => load(undefined, filters)} />
            </View>
          </View>
        ) : null}
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
        {more ? <Button variant="secondary" label={t('auditLog.more')} onPress={() => load(entries.at(-1), filters)} /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 },
  action: { ...type.body, fontWeight: '700' },
  details: { ...type.small, color: colors.textMuted },
  filters: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
});

export default staffOnly(AuditLog, ['admin']);
