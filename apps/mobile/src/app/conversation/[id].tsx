// One conversation: a prayer note thread, a direct message, or a group chat.
// New messages are fetched every few seconds while the screen is open.
import { MESSAGE_MAX_CHARS, type ConversationView } from '@prayer-tower/shared';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';

import { CrisisSupport } from '@/components/crisis';
import { Button, Chip, ErrorText, Field, RulesWarning, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const POLL_MS = 5000;

export default function ConversationScreen() {
  const { t } = useLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<ConversationView | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warned, setWarned] = useState(false);
  const [support, setSupport] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reported, setReported] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [connections, setConnections] = useState<{ id: string; display_name: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const scroll = useRef<ScrollViewInstance>(null);

  const load = useCallback(async () => {
    try {
      const v = await api.conversation(id);
      setView(v);
      api.markConversationRead(id).catch(() => undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const send = async (confirmed = false) => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      if (!confirmed && (await api.precheck(body)).warn) {
        setWarned(true);
        return;
      }
      setWarned(false);
      const r = await api.sendMessage(id, body);
      if (r.message.crisis) setSupport(true);
      setText('');
      await load();
      scroll.current?.scrollToEnd({ animated: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<unknown>, after: 'reload' | 'leave' = 'reload') => {
    try {
      await fn();
      if (after === 'leave') router.canGoBack() ? router.back() : router.replace('/messages');
      else await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const sendReport = async () => {
    if (!reporting || !reason.trim()) return;
    try {
      await api.report('message', reporting, reason.trim());
      setReported((r) => [...r, reporting]);
      setReporting(null);
      setReason('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openInvite = async () => {
    setInviting(true);
    try {
      setConnections((await api.connections()).people);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const c = view?.conversation;
  const other = c && c.kind !== 'group' ? c.members[0] : null;
  const crisis = support || view?.messages.some((m) => m.crisis);

  return (
    <Screen>
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Messages" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
        {c ? (
          <View style={styles.head}>
            <Text style={type.title}>{c.title}</Text>
            {c.topic ? <Text style={type.body}>{c.topic}</Text> : null}
            {c.kind === 'group' ? (
              <Text style={type.small}>
                {c.members.length + 1} {c.members.length === 0 ? 'member' : 'members'} · {c.isPublic ? 'open to all' : 'invite only'}
              </Text>
            ) : null}
            {c.post ? (
              <Pressable onPress={() => router.push(`/post/${c.post!.id}`)} style={styles.post} accessibilityRole="link">
                <Text style={type.small}>{t('conversation.about')}</Text>
                <Text style={type.body}>{c.post.excerpt}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {crisis ? <CrisisSupport /> : null}

        {c?.isRequest ? (
          <View style={styles.request}>
            <Text style={type.body}>
              {c.kind === 'group'
                ? t('conversation.invited')
                : t('conversation.wantsToTalk', { name: c.title })}
            </Text>
            <View style={styles.row}>
              <Button small label={c.kind === 'group' ? t('conversation.join') : t('conversation.accept')} onPress={() => act(() => (c.kind === 'group' ? api.joinGroup(id) : api.acceptConversation(id)))} />
              <Button small variant="secondary" label={t('conversation.noThanks')} onPress={() => act(() => api.leaveConversation(id), 'leave')} />
              {other?.id ? <Button small variant="ghost" label={t('conversation.block')} onPress={() => act(() => api.block(other.id!), 'leave')} /> : null}
            </View>
          </View>
        ) : null}

        {view?.messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            {!m.mine && c?.kind === 'group' ? <Text style={styles.author}>{m.author}</Text> : null}
            <Text style={[type.body, m.mine && { color: '#fff' }]}>{m.body}</Text>
            <View style={styles.meta}>
              <Text style={[type.small, m.mine && { color: '#E9E2F5' }]}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
              {!m.mine ? (
                reported.includes(m.id) ? (
                  <Text style={type.small}>{t('conversation.reported')}</Text>
                ) : (
                  <Text style={styles.report} onPress={() => setReporting(m.id)} accessibilityRole="button">
                    {t('post.report')}
                  </Text>
                )
              ) : null}
            </View>
          </View>
        ))}

        {reporting ? (
          <View style={styles.sheet}>
            <Text style={type.heading}>{t('conversation.reportTitle')}</Text>
            <Text style={type.small}>{t('conversation.reportNote')}</Text>
            <Field placeholder={t('conversation.whatsWrong')} value={reason} onChangeText={setReason} maxLength={1000} multiline />
            <View style={styles.row}>
              <Button small label={t('actions.sendReport')} onPress={sendReport} disabled={!reason.trim()} />
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => setReporting(null)} />
            </View>
          </View>
        ) : null}

        <ErrorText error={error} />
        {c?.awaitingReply ? <Text style={type.small}>{t('conversation.waiting')}</Text> : null}

        {c && !c.isRequest && !c.awaitingReply ? (
          <View style={styles.compose}>
            <Field
              placeholder={c.kind === 'group' ? t('conversation.writeGroup') : t('conversation.write')}
              value={text}
              onChangeText={(t) => {
                setText(t);
                setWarned(false);
              }}
              maxLength={MESSAGE_MAX_CHARS}
              multiline
            />
            {warned ? <RulesWarning onPostAnyway={() => send(true)} busy={busy} /> : null}
            <Button label={t('actions.send')} onPress={() => send()} busy={busy} disabled={!text.trim()} />
          </View>
        ) : null}

        {c && !c.isRequest ? (
          <View style={styles.row}>
            {c.kind === 'group' && (c.isOwner || c.isPublic) ? <Button small variant="secondary" label={t('conversation.invite')} onPress={openInvite} /> : null}
            {c.kind === 'group' ? <Button small variant="secondary" label="Group events" onPress={() => router.push(`/events?groupId=${id}`)} /> : null}
            {other?.id ? <Button small variant="ghost" label={t('person.block', { name: other.name })} onPress={() => act(() => api.block(other.id!), 'leave')} /> : null}
            <Button small variant="ghost" label={c.kind === 'group' ? t('conversation.leave') : t('conversation.close')} onPress={() => act(() => api.leaveConversation(id), 'leave')} />
          </View>
        ) : null}

        {inviting ? (
          <View style={styles.sheet}>
            <Text style={type.heading}>{t('conversation.inviteTitle')}</Text>
            {connections.length === 0 ? <Text style={type.small}>{t('conversation.followToInvite')}</Text> : null}
            <View style={styles.row}>
              {connections.map((p) => (
                <Chip
                  key={p.id}
                  label={p.display_name || t('conversation.member')}
                  selected={picked.includes(p.id)}
                  onPress={() => setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))}
                />
              ))}
            </View>
            <View style={styles.row}>
              <Button
                small
                label={t('conversation.sendInvites')}
                disabled={!picked.length}
                onPress={() =>
                  act(async () => {
                    await api.inviteToGroup(id, picked);
                    setPicked([]);
                    setInviting(false);
                  })
                }
              />
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => setInviting(false)} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  head: { gap: space.xs },
  post: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 },
  request: { backgroundColor: colors.goldSoft, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, padding: space.md, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  author: { fontWeight: '700', color: colors.primary, fontSize: 13 },
  meta: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  report: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  compose: { gap: space.sm },
});
