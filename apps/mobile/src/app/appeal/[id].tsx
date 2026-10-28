// Appeal a moderation decision on your own content. One appeal per decision;
// a different moderator can review it. Suspended members can still appeal.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export default function AppealScreen() {
  const { t } = useLocale();
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
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('appeal.title')}</Text>
        {sent ? (
          <Text style={type.body}>{t('appeal.sent')}</Text>
        ) : (
          <>
            <Text style={type.body}>{t('appeal.intro')}</Text>
            <Field placeholder={t('appeal.reason')} value={message} onChangeText={setMessage} multiline maxLength={1000} />
            <ErrorText error={error} />
            <Button label={t('appeal.send')} busy={busy} disabled={!message.trim()} onPress={send} />
          </>
        )}
        <Button small variant="ghost" label={t('appeal.rules')} onPress={() => router.push('/rules')} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
});
