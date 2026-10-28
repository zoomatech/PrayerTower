// Admin → Invite codes → Import: a pilot church pastes (or, on the web, picks)
// a CSV of members, who become single-use invite codes, or of starter prayer
// requests, posted by this admin. Preview first; nothing changes until Import.
// docs/CSV_IMPORT.md.
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Chip, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api, type ImportResult } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

type Kind = 'members' | 'requests';

/** Web only: let the admin pick a .csv file and read it as text. */
function pickCsvFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      file.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

function Import() {
  const { t } = useLocale();
  const [kind, setKind] = useState<Kind>('members');
  const [csv, setCsv] = useState('');
  const [note, setNote] = useState('');
  const [sendEmails, setSendEmails] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.admin.importCsv({ kind, csv, dryRun, note: note.trim(), sendEmails: kind === 'members' && sendEmails });
      setResult(r);
      if (r.error) setError(r.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choose = (k: Kind) => {
    setKind(k);
    setResult(null);
  };
  const previewed = result?.dryRun && !result.error && result.kind === kind;
  const ready = previewed ? result.counts.ok : 0;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/invites'))} />
        <Text style={type.title}>{t('import.title')}</Text>
        <Text style={type.body}>{t('import.intro')}</Text>
        <View style={styles.row}>
          <Chip label={t('import.members')} selected={kind === 'members'} onPress={() => choose('members')} />
          <Chip label={t('import.requests')} selected={kind === 'requests'} onPress={() => choose('requests')} />
        </View>
        <Text style={type.small}>{kind === 'members' ? t('import.membersHint') : t('import.requestsHint')}</Text>
        {Platform.OS === 'web' ? (
          <Button
            small
            variant="secondary"
            label={t('import.pickFile')}
            onPress={() =>
              pickCsvFile().then((text) => {
                if (text !== null) {
                  setCsv(text);
                  setResult(null);
                }
              })
            }
          />
        ) : null}
        <Field
          label={t('import.paste')}
          value={csv}
          onChangeText={(v) => {
            setCsv(v);
            setResult(null);
          }}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={{ minHeight: 140, fontFamily: 'monospace' }}
          placeholder={kind === 'members' ? 'email,name' : 'request,anonymous'}
        />
        {kind === 'members' ? (
          <>
            <Field label={t('import.note')} value={note} onChangeText={setNote} maxLength={120} placeholder={t('import.notePlaceholder')} />
            <Toggle label={t('import.sendEmails')} hint={t('import.sendEmailsHint')} value={sendEmails} onChange={setSendEmails} />
          </>
        ) : null}
        <ErrorText error={error} />
        <View style={styles.row}>
          <Button label={t('import.preview')} variant="secondary" onPress={() => run(true)} busy={busy} disabled={!csv.trim()} />
          <Button label={t('import.run', { count: ready })} onPress={() => run(false)} busy={busy} disabled={!previewed || ready === 0} />
        </View>

        {result && !result.error ? (
          <View style={{ gap: space.xs }}>
            <Text role="status" style={[type.body, { fontWeight: '700' }]}>
              {result.dryRun ? t('import.previewSummary', { ok: result.counts.ok, skipped: result.counts.skipped, errors: result.counts.error }) : t('import.doneSummary', { done: result.counts.invited + result.counts.emailed + result.counts.posted, skipped: result.counts.skipped, errors: result.counts.error })}
            </Text>
            {result.rows.map((r) => (
              <View key={r.line} style={styles.card}>
                <Text style={type.small}>
                  {t('import.line', { line: r.line })} · {t(`import.status.${r.status}`)}
                  {r.code ? ` · ${r.code}` : ''}
                </Text>
                <Text style={type.body} selectable>
                  {r.email ? `${r.name ? `${r.name} ` : ''}<${r.email}>` : r.request}
                </Text>
                {r.reason ? <Text style={[type.small, { color: r.status === 'error' ? colors.danger : colors.textMuted }]}>{r.reason}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.sm, gap: 2 },
});

export default staffOnly(Import, ['admin']);
