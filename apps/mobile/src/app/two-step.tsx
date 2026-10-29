// The second step of signing in: the 6-digit code from the member's
// authenticator app. The only screen until the code is right or they sign out.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { verifyCode } from '@/components/two-step';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, type } from '@/lib/theme';

export default function TwoStepScreen() {
  const { t } = useLocale();
  const { signOut, codeDone } = useAuth();
  // Backup codes (off by default). /features needs the code first, so this asks the public sign-in settings.
  const [backupCodes, setBackupCodes] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const [backup, setBackup] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.signupConfig().then((c) => setBackupCodes(c.backupCodes === true), () => undefined);
    supabase.auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp.find((f) => f.status === 'verified')?.id ?? null));
  }, []);

  // Once the code is right, Supabase refreshes the session and the app opens.
  const submit = async () => {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const err = await verifyCode(factorId, code);
    setBusy(false);
    if (err) {
      setCode('');
      setError(err);
    }
  };

  const spend = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.useBackupCode(backup);
      await codeDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.form}>
          <Text style={type.title}>{t('twoStep.enterTitle')}</Text>
          <Text style={type.body}>{t('twoStep.enterIntro')}</Text>
          {useBackup ? (
            <>
              <Text style={type.body}>{t('backupCodes.enterIntro')}</Text>
              <Field label={t('backupCodes.code')} value={backup} onChangeText={setBackup} autoCapitalize="characters" autoCorrect={false} testID="backup-code" autoFocus />
              <ErrorText error={error} />
              <Button testID="backup-code-submit" label={t('backupCodes.use')} onPress={spend} busy={busy} disabled={backup.replace(/[\s-]/g, '').length < 8} />
              <Button variant="ghost" label={t('backupCodes.back')} onPress={() => (setUseBackup(false), setError(null))} />
            </>
          ) : (
            <>
              <Field label={t('twoStep.code')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} testID="two-step-code" autoFocus />
              <ErrorText error={error} />
              <Button testID="two-step-submit" label={t('twoStep.continue')} onPress={submit} busy={busy} disabled={!factorId || code.trim().length !== 6} />
              {backupCodes ? (
                <Button variant="ghost" testID="use-backup-code" label={t('backupCodes.lostPhone')} onPress={() => (setUseBackup(true), setError(null))} />
              ) : null}
            </>
          )}
          <Button variant="ghost" label={t('profile.signOut')} onPress={() => void signOut()} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center' },
  form: { padding: space.lg, gap: space.md },
});
