// Delete my account (App Store Review Guideline 5.1.1(v)): easy to find from
// the profile, one confirmation, done at once.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export default function DeleteAccountScreen() {
  const { t } = useLocale();
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      await signOut();
      router.replace('/sign-in');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.deleteAccount')}</Text>
        <Text style={type.body}>{t('deleteAccount.intro')}</Text>
        <Text style={type.body}>
          {t('deleteAccount.list')}
        </Text>
        <Text style={type.small}>
          {t('deleteAccount.keep')}
        </Text>
        <Field label={t('deleteAccount.confirm')} placeholder="DELETE" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
        <ErrorText error={error} />
        <Button label={t('profile.deleteAccount')} busy={busy} disabled={confirm.trim() !== 'DELETE'} onPress={remove} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
});
