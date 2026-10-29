// Passkeys (Supabase Auth, https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta),
// Admin → Sign-in security → Passkeys, off. Sign in with Face ID, Touch ID or a
// security key instead of a password. Web for now: Supabase's passkey API is
// browser WebAuthn, so the iPhone app doesn't offer it yet (docs/TWO_STEP.md).
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/lib/theme';

/** Passkeys need a browser with WebAuthn. */
export const passkeysPossible = () => Platform.OS === 'web' && typeof window !== 'undefined' && 'PublicKeyCredential' in window;

interface Passkey {
  id: string;
  friendly_name?: string | null;
  created_at?: string;
}

export function PasskeysCard() {
  const { passkeys } = useFeatures();
  const { t, language } = useLocale();
  const [list, setList] = useState<Passkey[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.auth.passkey.list();
    if (err) return setError(err.message);
    setList((data as Passkey[] | null) ?? []);
  }, []);
  useEffect(() => {
    if (passkeys && passkeysPossible()) void load();
  }, [passkeys, load]);

  if (!passkeys || !passkeysPossible()) return null;
  const add = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.registerPasskey();
    setBusy(false);
    if (err) return setError(err.message);
    setNotice(t('passkeys.added'));
    await load();
  };
  const remove = async (id: string) => {
    const { error: err } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (err) return setError(err.message);
    await load();
  };

  return (
    <View style={styles.card} testID="passkeys">
      <Text style={type.heading}>{t('passkeys.title')}</Text>
      <Text style={type.small}>{t('passkeys.intro')}</Text>
      {(list ?? []).map((p) => (
        <View key={p.id} style={styles.row}>
          <Text style={[type.body, styles.name]}>
            {p.friendly_name || t('passkeys.unnamed')}
            {p.created_at ? ` · ${new Date(p.created_at).toLocaleDateString(language === 'es' ? 'es' : 'en-US')}` : ''}
          </Text>
          <Button small variant="ghost" label={t('passkeys.remove')} onPress={() => remove(p.id)} />
        </View>
      ))}
      <Button small variant="secondary" label={t('passkeys.add')} onPress={add} busy={busy} />
      <ErrorText error={error} />
      {notice ? (
        <Text style={type.body} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
    </View>
  );
}

/** The sign-in screen's "Sign in with a passkey" (only while the switch is on, in a browser). */
export function PasskeySignIn({ on, onError }: { on: boolean; onError: (message: string) => void }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  if (!on || !passkeysPossible()) return null;
  const go = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPasskey();
    setBusy(false);
    if (error) onError(error.message);
  };
  return <Button variant="secondary" testID="passkey-sign-in" label={t('passkeys.signIn')} onPress={go} busy={busy} />;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, minWidth: 0 },
});
