// Pilot feedback: tell us what's broken, confusing or worth adding. Admins read
// it on the admin screen.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

const KINDS = [
  { value: 'bug', label: 'Something broke' },
  { value: 'idea', label: 'An idea' },
  { value: 'other', label: 'Something else' },
] as const;

export default function FeedbackScreen() {
  const { t } = useLocale();
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
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('profile.feedback')}</Text>
        <Text style={type.body}>{t('feedback.intro')}</Text>
        <View style={styles.row}>
          {KINDS.map((k) => (
            <Chip key={k.value} label={t(`feedback.kinds.${k.value}`)} selected={kind === k.value} onPress={() => setKind(k.value)} />
          ))}
        </View>
        <Field
          label={t('feedback.label')}
          placeholder={kind === 'bug' ? t('feedback.bugPlaceholder') : t('feedback.placeholder')}
          value={body}
          onChangeText={(t) => {
            setBody(t);
            setSent(false);
          }}
          multiline
          maxLength={2000}
        />
        <ErrorText error={error} />
        {sent ? <Text style={[type.small, { color: colors.primary }]}>{t('feedback.sent')}</Text> : null}
        <Button label={t('actions.send')} onPress={send} busy={busy} disabled={!body.trim()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
