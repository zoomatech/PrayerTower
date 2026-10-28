import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { LanguagePicker } from '@/components/language-picker';
import { LegalLinks } from '@/components/legal-links';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { authRedirectUrl } from '@/lib/auth-links';
import { env } from '@/lib/env';
import { useLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, space, type } from '@/lib/theme';

// The two refusals from the invite check (supabase/migrations/…_invite_codes.sql).
const INVITE_ERRORS: Record<string, 'signIn.inviteNeeded' | 'signIn.inviteInvalid'> = {
  'Prayer Tower is invite-only right now. Enter your invite code.': 'signIn.inviteNeeded',
  'That invite code is not valid. Check it, or ask for a new one.': 'signIn.inviteInvalid',
};

export default function SignIn() {
  const { t, n, language } = useLocale();
  // An invite link (…/sign-in?invite=CODE) opens straight to sign-up with the code filled in.
  const params = useLocalSearchParams<{ invite?: string }>();
  const { setRecovering, linkError } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up' | 'forgot'>(params.invite ? 'sign-up' : 'sign-in');
  // Password reset: the email has a link and a code; the code works when the link opens elsewhere.
  const [resetSent, setResetSent] = useState(false);
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState(params.invite ?? '');
  // Assume invite-only (the default) until the server says otherwise.
  const [inviteOnly, setInviteOnly] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api.signupConfig().then((c) => setInviteOnly(c.inviteOnly), () => undefined);
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error: err } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim(), locale: language, ...(env.edition === 'open-circle' ? { community: 'open-circle' } : {}), ...(invite.trim() ? { invite_code: invite.trim() } : {}) } } });
    setBusy(false);
    const inviteError = err && INVITE_ERRORS[err.message];
    if (err) setError(inviteError ? t(inviteError) : err.message);
    else if (mode === 'sign-up' && !data.session) setNotice(t('signIn.checkEmail'));
  };

  const sendReset = async () => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: authRedirectUrl() });
    setBusy(false);
    if (err) setError(err.message);
    else setResetSent(true);
  };

  const useCode = async () => {
    setBusy(true);
    setError(null);
    // Set first, so the app opens "Choose a new password" the moment the code signs them in.
    setRecovering(true);
    const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'recovery' });
    if (err) {
      setRecovering(false);
      setBusy(false);
      setError(err.message);
    }
  };

  const switchMode = (next: 'sign-in' | 'sign-up' | 'forgot') => {
    setMode(next);
    setError(null);
    setNotice(null);
    setResetSent(false);
    setCode('');
  };

  if (mode === 'forgot') {
    return (
      <Screen>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
          <View style={styles.form}>
            <Text style={type.title}>{t('signIn.forgotTitle')}</Text>
            <Text style={type.body}>{resetSent ? t('signIn.resetSent') : t('signIn.forgotIntro')}</Text>
            <Field label={t('signIn.email')} value={email} onChangeText={setEmail} testID="reset-email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!resetSent} />
            {resetSent ? (
              <Field label={t('signIn.resetCode')} value={code} onChangeText={setCode} testID="reset-code" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} />
            ) : null}
            <ErrorText error={error} />
            {resetSent ? (
              <Button testID="reset-continue" label={t('signIn.resetContinue')} onPress={useCode} busy={busy} disabled={code.trim().length < 6} />
            ) : (
              <Button testID="reset-send" label={t('signIn.resetSend')} onPress={sendReset} busy={busy} disabled={!email.includes('@')} />
            )}
            {resetSent ? <Button variant="ghost" label={t('signIn.resetAgain')} onPress={() => setResetSent(false)} /> : null}
            <Button variant="ghost" label={t('signIn.toSignIn')} onPress={() => switchMode('sign-in')} />
          </View>
        </KeyboardAvoidingView>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.hero}>
          <Text style={styles.logo} aria-hidden>
            🕊
          </Text>
          <Text style={type.title}>{n('Prayer Tower')}</Text>
          <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
            {t('signIn.tagline')}
          </Text>
        </View>
        <View style={styles.form}>
          {mode === 'sign-up' ? <Field label={t('signIn.name')} value={name} onChangeText={setName} autoComplete="name" /> : null}
          {mode === 'sign-up' && inviteOnly ? (
            <Field label={t('signIn.inviteCode')} value={invite} onChangeText={setInvite} autoCapitalize="characters" autoCorrect={false} placeholder={t('signIn.invitePlaceholder')} />
          ) : null}
          <Field label={t('signIn.email')} value={email} onChangeText={setEmail} testID="sign-in-email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label={t('signIn.password')} value={password} onChangeText={setPassword} testID="sign-in-password" secureTextEntry autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} />
          <ErrorText error={error ?? (linkError ? t('signIn.linkExpired') : null)} />
          {notice ? <Text style={type.small}>{notice}</Text> : null}
          <Button
            testID="sign-in-submit"
            label={mode === 'sign-in' ? t('signIn.signIn') : t('signIn.createAccount')}
            onPress={submit}
            busy={busy}
            disabled={!email || password.length < 8 || (mode === 'sign-up' && (!name.trim() || (inviteOnly && !invite.trim())))}
          />
          {mode === 'sign-up' && inviteOnly ? <Text style={type.small}>{t('signIn.inviteHint')}</Text> : null}
          {mode === 'sign-up' ? <LegalLinks prefix={t('signIn.legalPrefix')} /> : null}
          {mode === 'sign-in' ? <Button variant="ghost" testID="forgot-password" label={t('signIn.forgot')} onPress={() => switchMode('forgot')} /> : null}
          <Button
            variant="ghost"
            label={mode === 'sign-in' ? t('signIn.toSignUp') : t('signIn.toSignIn')}
            onPress={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          />
          <LanguagePicker heading={false} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.xxl },
  hero: { alignItems: 'center', gap: space.sm },
  logo: { fontSize: 56 },
  form: { gap: space.md },
});
