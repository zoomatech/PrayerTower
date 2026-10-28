import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { LanguagePicker } from '@/components/language-picker';
import { LegalLinks } from '@/components/legal-links';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, space, type } from '@/lib/theme';

export default function SignIn() {
  const t = useT();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { data, error: err } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
    setBusy(false);
    if (err) setError(err.message);
    else if (mode === 'sign-up' && !data.session) setNotice(t('signIn.checkEmail'));
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.hero}>
          <Text style={styles.logo}>🕊</Text>
          <Text style={type.title}>Prayer Tower</Text>
          <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
            {t('signIn.tagline')}
          </Text>
        </View>
        <View style={styles.form}>
          {mode === 'sign-up' ? <Field label={t('signIn.name')} value={name} onChangeText={setName} autoComplete="name" /> : null}
          <Field label={t('signIn.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label={t('signIn.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} />
          <ErrorText error={error} />
          {notice ? <Text style={type.small}>{notice}</Text> : null}
          <Button
            label={mode === 'sign-in' ? t('signIn.signIn') : t('signIn.createAccount')}
            onPress={submit}
            busy={busy}
            disabled={!email || password.length < 6 || (mode === 'sign-up' && !name.trim())}
          />
          {mode === 'sign-up' ? <LegalLinks prefix={t('signIn.legalPrefix')} /> : null}
          <Button
            variant="ghost"
            label={mode === 'sign-in' ? t('signIn.toSignUp') : t('signIn.toSignIn')}
            onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
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
