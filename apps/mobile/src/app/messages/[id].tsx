// One conversation about a request. Messages are checked like comments: a
// rules warning before sending, crisis support, report and block.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CrisisSupport } from '@/components/crisis';
import { Button, ErrorText, Field, RulesWarning, Screen } from '@/components/ui';
import { api, type Conversation, type Message } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<(Conversation & { blocked: boolean }) | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnedFor, setWarnedFor] = useState<string | null>(null);
  const [support, setSupport] = useState(false);
  const [reported, setReported] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.conversation(id);
      setConversation(r.conversation);
      setMessages(r.messages);
      api.markConversationRead(id).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async (confirmed = false) => {
    setBusy(true);
    setError(null);
    try {
      if (!confirmed && (await api.precheck(text.trim())).warn) {
        setWarnedFor(text);
        return;
      }
      setWarnedFor(null);
      const r = await api.sendMessage(id, text.trim());
      if (r.message.crisis) setSupport(true);
      setText('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const report = (m: Message) =>
    api
      .report('message', m.id, 'Harmful or abusive')
      .then(() => setReported(m.id))
      .catch((e) => setError((e as Error).message));

  const toggleBlock = () =>
    conversation &&
    api
      .setBlocked(id, !conversation.blocked)
      .then((r) => setConversation({ ...conversation, blocked: r.blocked }))
      .catch((e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
        {conversation ? (
          <>
            <Text style={type.title}>{conversation.with.displayName}</Text>
            <Text style={[type.small, styles.link]} onPress={() => router.push(`/post/${conversation.postId}`)} numberOfLines={2}>
              About: {conversation.postPreview}
            </Text>
          </>
        ) : null}
        {support ? <CrisisSupport /> : null}
        <ErrorText error={error} />
        {messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            <Text style={type.body}>{m.body}</Text>
            <Text style={type.small}>
              {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {!m.mine ? (
                reported === m.id ? (
                  ' · Reported'
                ) : (
                  <Text style={styles.report} onPress={() => report(m)} accessibilityRole="button">
                    {' · Report'}
                  </Text>
                )
              ) : null}
            </Text>
          </View>
        ))}
        {conversation?.blocked ? (
          <Text style={type.small}>You blocked this person. Neither of you can send messages here.</Text>
        ) : (
          <View style={{ gap: space.sm }}>
            <Field placeholder="Write a message" value={text} onChangeText={setText} multiline maxLength={2000} />
            {warnedFor !== null && warnedFor === text ? <RulesWarning busy={busy} onPostAnyway={() => send(true)} /> : null}
            <Button small label="Send" onPress={() => send()} busy={busy} disabled={!text.trim()} />
          </View>
        )}
        {conversation ? (
          <Text style={styles.report} onPress={toggleBlock} accessibilityRole="button">
            {conversation.blocked ? 'Unblock' : `Block ${conversation.with.displayName}`}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, padding: space.md, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  link: { textDecorationLine: 'underline' },
  report: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
});
