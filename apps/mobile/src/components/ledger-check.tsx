// Admin → Tokens: the latest token ledger integrity check (it runs nightly;
// any problem also alerts every admin) and a button to run one now.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { api, type LedgerCheck } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

import { Button, ErrorText } from './ui';
import { errorText } from '@/lib/error-report';

export function LedgerCheckPanel() {
  const { t, language } = useLocale();
  const [last, setLast] = useState<LedgerCheck | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.admin.ledgerChecks().then((r) => setLast(r.checks[0] ?? null), (e: unknown) => setError(errorText(e)));
    }, []),
  );

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setLast((await api.admin.runLedgerCheck()).check);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleString(language === 'es' ? 'es' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.body, { fontWeight: '700' }]}>{t('ledgerCheck.title')}</Text>
      {last === null ? <Text style={type.small}>{t('ledgerCheck.never')}</Text> : null}
      {last ? (
        <View role="status">
          <Text style={[type.body, { color: last.ok ? colors.text : colors.danger }]}>
            {last.ok ? t('ledgerCheck.ok', { date: when(last.checkedAt) }) : t('ledgerCheck.problems', { count: last.problems.length, date: when(last.checkedAt) })}
          </Text>
          <Text style={type.small}>{t('ledgerCheck.counts', { accounts: last.accountsChecked, transfers: last.transfersChecked })}</Text>
          {last.problems.slice(0, 10).map((p, i) => (
            <Text key={i} style={type.small} selectable>
              {t(`ledgerCheck.check.${p.check}`)}: {JSON.stringify({ ...p, check: undefined })}
            </Text>
          ))}
        </View>
      ) : null}
      <ErrorText error={error} />
      <Button small variant="secondary" label={t('ledgerCheck.run')} onPress={run} busy={busy} />
    </View>
  );
}
