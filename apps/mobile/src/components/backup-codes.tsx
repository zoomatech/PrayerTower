// Backup codes for two-step sign-in (Admin → Sign-in security → Backup codes, off).
// Ten one-time codes a member saves; one of them gets them back in after losing
// their phone (two-step sign-in is then turned off so they can set it up again).
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { saveText } from '@/lib/save-file';
import { colors, radius, space, type } from '@/lib/theme';

export function BackupCodes() {
  const { backupCodes } = useFeatures();
  const { t } = useLocale();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .backupCodes()
      .then((s) => setRemaining(s.enabled ? s.remaining : null))
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    if (backupCodes) load();
  }, [backupCodes, load]);

  if (!backupCodes) return null;
  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      setCodes((await api.makeBackupCodes()).codes);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    saveText('backup-codes.txt', `${t('backupCodes.fileIntro')}\n\n${codes!.join('\n')}\n`, 'text/plain', 'public.plain-text').catch((e) => setError((e as Error).message));

  return (
    <View style={styles.box} testID="backup-codes">
      <Text style={type.heading}>{t('backupCodes.title')}</Text>
      {codes ? (
        <>
          <Text style={type.body}>{t('backupCodes.saveNow')}</Text>
          <View style={styles.codes} accessibilityLabel={t('backupCodes.listLabel', { count: codes.length })}>
            {codes.map((c) => (
              <Text key={c} selectable style={styles.code}>
                {c}
              </Text>
            ))}
          </View>
          <Button small variant="secondary" label={t('backupCodes.download')} onPress={save} />
          <Button small label={t('backupCodes.saved')} onPress={() => setCodes(null)} />
        </>
      ) : (
        <>
          <Text style={type.small}>
            {remaining ? t('backupCodes.remaining', { count: remaining }) : t('backupCodes.intro')}
          </Text>
          <Button small variant="secondary" testID="backup-codes-make" label={remaining ? t('backupCodes.makeNew') : t('backupCodes.make')} onPress={make} busy={busy} />
          {remaining ? <Text style={type.small}>{t('backupCodes.makeNewHint')}</Text> : null}
        </>
      )}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.background },
  code: { ...type.body, width: 110, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), letterSpacing: 1 },
});
