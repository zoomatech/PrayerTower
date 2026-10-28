// One prayer group: its shared prayer list and its chat. Chat messages get the
// same rules warning, crisis support and report as private messages.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { CrisisSupport } from '@/components/crisis';
import { PostCard } from '@/components/post-card';
import { Button, Empty, ErrorText, Field, RulesWarning, Screen } from '@/components/ui';
import { api, type GroupPage } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<GroupPage | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnedFor, setWarnedFor] = useState<string | null>(null);
  const [support, setSupport] = useState(false);
  const [reported, setReported] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPage(await api.group(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  const { onAction, sheets } = useCardActions(load);

  const send = async (confirmed = false) => {
    setBusy(true);
    setError(null);
    try {
      if (!confirmed && (await api.precheck(text.trim())).warn) {
        setWarnedFor(text);
        return;
      }
      setWarnedFor(null);
      const r = await api.sendGroupMessage(id, text.trim());
      if (r.message.crisis) setSupport(true);
      setText('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const g = page?.group;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/groups'))} />
        {g ? (
          <>
            <Text style={type.title}>{g.name}</Text>
            {g.purpose ? <Text style={type.body}>{g.purpose}</Text> : null}
            <Text style={type.small}>{page.members.map((m) => (m.role === 'leader' ? `${m.displayName} (leader)` : m.displayName)).join(', ')}</Text>
            {g.inviteCode ? (
              <Text
                style={styles.link}
                accessibilityRole="button"
                onPress={() => Share.share({ message: `Join my prayer group “${g.name}” on Prayer Tower with invite code ${g.inviteCode}` }).catch(() => undefined)}
              >
                Invite someone (code {g.inviteCode})
              </Text>
            ) : null}
          </>
        ) : null}
        <ErrorText error={error} />

        <Text style={type.heading}>Our prayer list</Text>
        {page?.prayerList.length === 0 ? <Empty text="Add a request from its page with “Add to a group prayer list”." /> : null}
        {page?.prayerList.map((c) => (
          <PostCard key={c.id} card={c} onAction={onAction} />
        ))}

        <Text style={type.heading}>Group chat</Text>
        {support ? <CrisisSupport /> : null}
        {page?.messages.length === 0 ? <Empty text="No messages yet. Say hello and share what to pray for." /> : null}
        {page?.messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            {!m.mine ? <Text style={styles.author}>{m.author.displayName}</Text> : null}
            <Text style={type.body}>{m.body}</Text>
            <Text style={type.small}>
              {new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {!m.mine ? (
                reported === m.id ? (
                  ' · Reported'
                ) : (
                  <Text
                    style={styles.muted}
                    accessibilityRole="button"
                    onPress={() =>
                      api
                        .report('message', m.id, 'Harmful or abusive')
                        .then(() => setReported(m.id))
                        .catch((e) => setError((e as Error).message))
                    }
                  >
                    {' · Report'}
                  </Text>
                )
              ) : null}
            </Text>
          </View>
        ))}
        <Field placeholder="Message the group" value={text} onChangeText={setText} multiline maxLength={2000} />
        {warnedFor !== null && warnedFor === text ? <RulesWarning busy={busy} onPostAnyway={() => send(true)} /> : null}
        <Button small label="Send" onPress={() => send()} busy={busy} disabled={!text.trim()} />
        {g ? (
          <Text
            style={styles.muted}
            accessibilityRole="button"
            onPress={() =>
              api
                .leaveGroup(id)
                .then(() => router.replace('/groups'))
                .catch((e) => setError((e as Error).message))
            }
          >
            Leave this group
          </Text>
        ) : null}
      </ScrollView>
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  bubble: { maxWidth: '85%', borderRadius: radius.lg, padding: space.md, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  author: { fontWeight: '700', color: colors.text },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  muted: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
});
