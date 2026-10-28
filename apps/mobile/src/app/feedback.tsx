// Pilot feedback: tell us what's broken, confusing or worth adding. Admins read
// it on the admin screen.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, space, type } from '@/lib/theme';

const KINDS = [
  { value: 'bug', label: 'Something broke' },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Something else' },
] as const;

export default function FeedbackScreen() {
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.sendFeedback({ kind, body, platform: Platform.OS, appVersion: Constants.expoConfig?.version });
      setSent(true);
      setBody('');
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
        <Text style={type.title}>Send feedback</Text>
        <Text style={type.body}>Tell us what broke, what confused you, or what you wish Prayer Tower did. The pilot team reads every note.</Text>
        <View style={styles.row}>
          {KINDS.map((k) => (
            <Chip key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />
          ))}
        </View>
        <Field
          label="Your feedback"
          placeholder={kind === 'bug' ? 'What happened, and what did you expect?' : 'Tell us more'}
          value={body}
          onChangeText={(t) => {
            setBody(t);
            setSent(false);
          }}
          multiline
          maxLength={2000}
        />
        <ErrorText error={error} />
        {sent ? <Text style={[type.small, { color: colors.primary }]}>Thank you! Your feedback was sent.</Text> : null}
        <Button label="Send" onPress={send} busy={busy} disabled={!body.trim()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
