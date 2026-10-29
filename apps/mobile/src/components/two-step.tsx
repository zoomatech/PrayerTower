// Two-step sign-in with an authenticator app (Supabase Auth TOTP,
// https://supabase.com/docs/guides/auth/auth-mfa/totp). Shown on Me → Password
// and email while an admin has the switch on, or while the member has it on.
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';

import { BackupCodes } from '@/components/backup-codes';
import { Button, ErrorText, Field } from '@/components/ui';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/lib/theme';

interface Setup {
  factorId: string;
  qr: string;
  secret: string;
  uri: string;
}

/** Checks a 6-digit code against a factor (challenge, then verify). */
export async function verifyCode(factorId: string, code: string) {
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) return challenge.error.message;
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: code.trim() });
  return error?.message ?? null;
}

export function TwoStepSettings() {
  const { t } = useLocale();
  const features = useFeatures();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp.find((f) => f.status === 'verified')?.id ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (factorId === undefined || (!features.twoStep && !factorId)) return null;

  const start = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    // A setup left unfinished earlier would block a new one.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setBusy(false);
    if (err || !data) return setError(err?.message ?? t('twoStep.failed'));
    setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri });
  };

  const finish = async () => {
    if (!setup) return;
    setBusy(true);
    setError(null);
    const err = await verifyCode(setup.factorId, code);
    setBusy(false);
    if (err) return setError(err);
    setSetup(null);
    setCode('');
    setNotice(features.backupCodes ? `${t('twoStep.on')} ${t('backupCodes.nudge')}` : t('twoStep.on'));
    await load();
  };

  const turnOff = async () => {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (err) return setError(err.message);
    setNotice(t('twoStep.off'));
    await load();
  };

  return (
    <View style={styles.card}>
      <Text style={type.heading}>{t('twoStep.title')}</Text>
      {factorId ? (
        <>
          <Text style={type.body}>{t('twoStep.isOn')}</Text>
          <Button small variant="secondary" testID="two-step-off" label={t('twoStep.turnOff')} onPress={turnOff} busy={busy} />
          <BackupCodes />
        </>
      ) : setup ? (
        <>
          <Text style={type.body}>{t('twoStep.scan')}</Text>
          {/* Phones can't show the SVG QR code; they open the authenticator app with the link instead. */}
          {Platform.OS === 'web' ? <Image source={{ uri: setup.qr }} style={styles.qr} accessibilityLabel={t('twoStep.qr')} /> : null}
          {Platform.OS !== 'web' ? <Button small variant="secondary" label={t('twoStep.openApp')} onPress={() => Linking.openURL(setup.uri).catch(() => undefined)} /> : null}
          <Text style={type.small}>{t('twoStep.key')}</Text>
          <Text selectable style={[type.body, styles.secret]} testID="two-step-secret">
            {setup.secret}
          </Text>
          <Field label={t('twoStep.code')} value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} testID="two-step-setup-code" />
          <Button testID="two-step-finish" label={t('twoStep.finish')} onPress={finish} busy={busy} disabled={code.trim().length !== 6} />
          <Button small variant="ghost" label={t('common.cancel')} onPress={() => (setSetup(null), setCode(''))} />
        </>
      ) : (
        <>
          <Text style={type.body}>{t('twoStep.intro')}</Text>
          <Button small variant="secondary" testID="two-step-start" label={t('twoStep.turnOn')} onPress={start} busy={busy} />
        </>
      )}
      <ErrorText error={error} />
      {notice ? <Text style={type.body} accessibilityLiveRegion="polite">{notice}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  qr: { width: 200, height: 200, alignSelf: 'center', backgroundColor: '#fff' },
  secret: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), letterSpacing: 1 },
});
