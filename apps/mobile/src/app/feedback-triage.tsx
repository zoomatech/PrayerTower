// Admin → Feedback: triage what testers send from Me → Send feedback. Tag each
// item by type (suggested tags come pre-filled), set how serious it is, add a
// note, mark it handled, and export everything (or one tag) as CSV.
import { env } from '@/lib/env';
import { FEEDBACK_SEVERITIES, FEEDBACK_TAGS as ALL_TAGS, type FeedbackSeverity, type FeedbackTag } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api, type FeedbackItem } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

// The Spanish tag only matters once the Spanish switch is on; the pilot is English only.
const FEEDBACK_TAGS = ALL_TAGS.filter((g) => g !== 'spanish' || env.spanish);

type Status = 'open' | 'closed' | 'all';

function FeedbackTriage() {
  const { t, language } = useLocale();
  const [status, setStatus] = useState<Status>('open');
  const [tag, setTag] = useState<FeedbackTag | undefined>();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems((await api.admin.feedback({ status, tag })).feedback);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, tag]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleTag = (f: FeedbackItem, g: FeedbackTag) => {
    const next = f.tags.includes(g) ? f.tags.filter((x) => x !== g) : [...f.tags, g];
    if (!next.length || next.length > 6) return;
    // Show the change at once; the reload confirms it.
    setItems((prev) => prev.map((x) => (x.id === f.id ? { ...x, tags: next } : x)));
    run(() => api.admin.triageFeedback(f.id, { tags: next }));
  };

  const exportCsv = async () => {
    setBusy(true);
    setError(null);
    try {
      const csv = await api.admin.feedbackCsv({ status, tag });
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'prayer-tower-feedback.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        await Share.share({ title: t('feedbackTriage.title'), message: csv });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tagLabel = (g: FeedbackTag) => t(`feedbackTriage.tag.${g}`);
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('feedbackTriage.title')}</Text>
        <Text style={type.body}>{t('feedbackTriage.intro')}</Text>
        <ErrorText error={error} />
        {notice ? <Text style={type.small}>{notice}</Text> : null}

        <Text style={type.small}>{t('feedbackTriage.show')}</Text>
        <View style={styles.row}>
          {(['open', 'closed', 'all'] as const).map((s) => (
            <Chip key={s} label={t(`feedbackTriage.status.${s}`)} selected={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>
        <View style={styles.row}>
          <Chip label={t('feedbackTriage.anyTag')} selected={!tag} onPress={() => setTag(undefined)} />
          {FEEDBACK_TAGS.map((g) => (
            <Chip key={g} label={tagLabel(g)} selected={tag === g} onPress={() => setTag(tag === g ? undefined : g)} />
          ))}
        </View>
        <Button variant="secondary" label={t('feedbackTriage.export')} onPress={exportCsv} busy={busy} />

        {items.length === 0 && !error ? <Empty text={t('feedbackTriage.empty')} /> : null}
        {items.map((f) => (
          <View key={f.id} style={styles.card}>
            <Text style={styles.from}>
              {t('admin.feedbackFrom', { kind: t(`admin.feedbackKind.${f.kind === 'bug' || f.kind === 'idea' ? f.kind : 'other'}`), name: f.name })}
            </Text>
            <Text style={type.small}>
              {new Date(f.createdAt).toLocaleDateString(language)}
              {f.platform ? ` · ${f.platform}` : ''}
              {f.appVersion ? ` ${f.appVersion}` : ''}
              {f.status === 'closed' ? ` · ${t('feedbackTriage.status.closed')}` : ''}
            </Text>
            <Text style={type.body} selectable>
              {f.body}
            </Text>
            <Text style={type.small}>{t('feedbackTriage.type')}</Text>
            <View style={styles.row}>
              {FEEDBACK_TAGS.map((g) => (
                <Chip key={g} label={tagLabel(g)} selected={f.tags.includes(g)} onPress={() => toggleTag(f, g)} />
              ))}
            </View>
            <Text style={type.small}>{t('feedbackTriage.severity')}</Text>
            <View style={styles.row}>
              {FEEDBACK_SEVERITIES.map((s: FeedbackSeverity) => (
                <Chip
                  key={s}
                  label={t(`feedbackTriage.sev.${s}`)}
                  selected={f.severity === s}
                  onPress={() => run(() => api.admin.triageFeedback(f.id, { severity: f.severity === s ? null : s }))}
                />
              ))}
            </View>
            <Field
              label={t('feedbackTriage.note')}
              value={notes[f.id] ?? f.note ?? ''}
              onChangeText={(v) => setNotes((n) => ({ ...n, [f.id]: v }))}
              maxLength={1000}
              multiline
            />
            <View style={styles.row}>
              {notes[f.id] !== undefined && notes[f.id] !== (f.note ?? '') ? (
                <Button small variant="secondary" label={t('feedbackTriage.saveNote')} onPress={() => run(() => api.admin.triageFeedback(f.id, { note: notes[f.id]! }), t('feedbackTriage.saved'))} />
              ) : null}
              {f.status === 'open' ? (
                <Button small variant="ghost" label={t('admin.btn.handled')} onPress={() => run(() => api.admin.closeFeedback(f.id), t('feedbackTriage.closed'))} />
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
  from: { ...type.body, fontWeight: '700' },
});

export default staffOnly(FeedbackTriage, ['admin']);
