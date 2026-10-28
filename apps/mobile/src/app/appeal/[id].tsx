// Appeal a moderation decision on your own content. One appeal per decision;
// a different moderator can review it. Suspended members can still appeal.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { space, type } from '@/lib/theme';

export default function AppealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.appeal(id, message.trim());
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Appeal</Text>
        {sent ? (
          <Text style={type.body}>Thank you. A moderator will look at this again and you will get a notice with the outcome.</Text>
        ) : (
          <>
            <Text style={type.body}>Tell us why you think this decision was wrong. A moderator will look at it again.</Text>
            <Field placeholder="Your reason" value={message} onChangeText={setMessage} multiline maxLength={1000} />
            <ErrorText error={error} />
            <Button label="Send appeal" busy={busy} disabled={!message.trim()} onPress={send} />
          </>
        )}
        <Button small variant="ghost" label="Read the community rules" onPress={() => router.push('/rules')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
});
