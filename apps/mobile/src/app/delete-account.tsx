// Delete my account (App Store Review Guideline 5.1.1(v)): easy to find from
// the profile, one confirmation, done at once.
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { space, type } from '@/lib/theme';

export default function DeleteAccountScreen() {
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
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Delete my account</Text>
        <Text style={type.body}>This happens right away and can&apos;t be undone. We delete:</Text>
        <Text style={type.body}>
          • your sign-in and profile{'\n'}• your requests, comments, encouragements and photos{'\n'}• your messages, promises, events and prayer history
          {'\n'}• your tokens
        </Text>
        <Text style={type.small}>
          We keep only what we must: the token ledger and moderators&apos; past decisions, under &quot;Deleted member&quot; with no name or email. A
          request that already holds tokens others gave is emptied and taken down rather than erased.
        </Text>
        <Field label="Type DELETE to confirm" placeholder="DELETE" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
        <ErrorText error={error} />
        <Button label="Delete my account" busy={busy} disabled={confirm.trim() !== 'DELETE'} onPress={remove} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
});
