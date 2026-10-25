import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, space, type } from '@/lib/theme';

export default function SignIn() {
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
    else if (mode === 'sign-up' && !data.session) setNotice('Check your email to confirm your account, then sign in.');
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.hero}>
          <Text style={styles.logo}>🕊</Text>
          <Text style={type.title}>Prayer Tower</Text>
          <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
            Real people praying for you, by name, right now.
          </Text>
        </View>
        <View style={styles.form}>
          {mode === 'sign-up' ? <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} />
          <ErrorText error={error} />
          {notice ? <Text style={type.small}>{notice}</Text> : null}
          <Button
            label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            busy={busy}
            disabled={!email || password.length < 6 || (mode === 'sign-up' && !name.trim())}
          />
          <Button
            variant="ghost"
            label={mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          />
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
