// Sign-in and security: change password and email (Me → Password and email).
// After a password reset link or code, this is the only screen until a new
// password is chosen. Supabase Auth sends the confirmation emails
// (https://supabase.com/docs/reference/javascript/auth-updateuser).
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { PasskeysCard } from '@/components/passkeys';
import { TwoStepSettings } from '@/components/two-step';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { authRedirectUrl } from '@/lib/auth-links';
import { useLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, type } from '@/lib/theme';

const MIN_PASSWORD = 8;

export default function AccountSecurityScreen() {
  const { t } = useLocale();
  const { session, recovering, setRecovering, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<'password' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const savePassword = async () => {
    setBusy('password');
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (err) return setError(err.message);
    setPassword('');
    setAgain('');
    if (recovering) {
      setRecovering(false);
      router.replace('/');
    } else setNotice(t('accountSecurity.passwordSaved'));
  };

  const saveEmail = async () => {
    setBusy('email');
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.updateUser({ email: email.trim() }, { emailRedirectTo: authRedirectUrl() });
    setBusy(null);
    if (err) return setError(err.message);
    setEmail('');
    setNotice(t('accountSecurity.emailSent'));
  };

  const mismatch = again.length > 0 && again !== password;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {recovering ? null : <Button small variant="ghost" label={t('common.back')} onPress={leave} />}
        <Text style={type.title}>{recovering ? t('accountSecurity.chooseNew') : t('accountSecurity.title')}</Text>
        {session?.user.email ? <Text style={type.small}>{t('accountSecurity.signedInAs', { email: session.user.email })}</Text> : null}

        <Text style={type.heading}>{recovering ? t('accountSecurity.newPassword') : t('accountSecurity.changePassword')}</Text>
        <Field label={t('accountSecurity.newPassword')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" testID="new-password" />
        <Field label={t('accountSecurity.passwordAgain')} value={again} onChangeText={setAgain} secureTextEntry autoComplete="new-password" testID="new-password-again" />
        <Text style={type.small}>{mismatch ? t('accountSecurity.mismatch') : t('accountSecurity.passwordHint', { count: MIN_PASSWORD })}</Text>
        <Button
          testID="save-password"
          label={t('accountSecurity.savePassword')}
          onPress={savePassword}
          busy={busy === 'password'}
          disabled={password.length < MIN_PASSWORD || password !== again || busy !== null}
        />

        {recovering ? (
          <Button variant="ghost" label={t('accountSecurity.cancelReset')} onPress={() => void signOut()} />
        ) : (
          <>
            <Text style={type.heading}>{t('accountSecurity.changeEmail')}</Text>
            <Field label={t('accountSecurity.newEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" testID="new-email" />
            <Text style={type.small}>{t('accountSecurity.emailHint')}</Text>
            <Button
              variant="secondary"
              testID="save-email"
              label={t('accountSecurity.saveEmail')}
              onPress={saveEmail}
              busy={busy === 'email'}
              disabled={!email.includes('@') || email.trim() === session?.user.email || busy !== null}
            />
            <TwoStepSettings />
            <PasskeysCard />
          </>
        )}
        <ErrorText error={error} />
        {notice ? <Text style={type.body} accessibilityLiveRegion="polite">{notice}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
});
