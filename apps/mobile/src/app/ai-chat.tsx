// "Imagine a conversation with God": a role-play with an AI. The not-God warning
// stays pinned at the top and the AI's replies are labeled "AI (not God)".
// Nothing is saved; the recent turns live only on this screen.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiThread } from '@/components/ai-thread';
import { CrisisSupport } from '@/components/crisis';
import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api, type AiTurn } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function AiChat() {
  const { t } = useLocale();
  const [warning, setWarning] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [crisis, setCrisis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api
        .aiChatInfo()
        .then((r) => {
          setEnabled(r.enabled);
          setWarning(r.warning);
        })
        .catch((e) => setError((e as Error).message));
    }, []),
  );

  const send = async () => {
    const message = draft.trim();
    if (!message) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.aiChat(message, turns);
      setTurns((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: r.reply }]);
      setWarning(r.warning);
      if (r.crisis) setCrisis(true);
      setDraft('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />;
  // Switched off, or an Open Circle member (who never sees the God role-play): say only that it isn't available.
  if (enabled === false) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.content}>
          {back}
          <Text style={type.body}>{t('ai.chatUnavailable')}</Text>
        </ScrollView>
      </Screen>
    );
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {back}
        <Text style={type.title}>{t('ai.chatTitle')}</Text>
        {warning ? (
          <View style={styles.warning} accessibilityRole="alert">
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ) : null}
        <Text style={type.body}>{t('ai.chatIntro')}</Text>
        {crisis ? <CrisisSupport /> : null}
        <AiThread turns={turns} you={t('ai.you')} ai={t('ai.ai')} />
        {busy ? <Text style={type.small}>{t('ai.writing')}</Text> : null}
        <ErrorText error={error} />
        {enabled ? (
          <>
            <Field placeholder={t('ai.placeholder')} value={draft} onChangeText={setDraft} multiline maxLength={2000} />
            <Button label={t('ai.send')} onPress={send} busy={busy} disabled={!draft.trim()} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 80 },
  warning: { backgroundColor: colors.goldSoft, borderRadius: radius.md, padding: space.md, borderWidth: 1, borderColor: colors.gold },
  warningText: { ...type.body, color: colors.goldText, fontWeight: '600' },
});
