// Prayer & topical group chats (notebook Page 9, #6): find open groups or start one.
import type { PublicGroup } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function Groups() {
  const [groups, setGroups] = useState<PublicGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups((await api.groups()).groups);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.createGroup({ title: title.trim(), topic: topic.trim() || undefined, isPublic, memberIds: [] });
      router.replace(`/conversation/${r.conversationId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = async (g: PublicGroup) => {
    try {
      if (!g.joined) await api.joinGroup(g.id);
      router.push(`/conversation/${g.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
        <Text style={type.title}>Prayer groups</Text>
        <Text style={type.body}>Pray and talk together about a need, a place, or a topic.</Text>
        <ErrorText error={error} />

        {creating ? (
          <View style={styles.card}>
            <Field label="Group name" placeholder="Morning prayer circle" value={title} onChangeText={setTitle} maxLength={80} />
            <Field label="What it's for (optional)" placeholder="We pray together at 7am" value={topic} onChangeText={setTopic} maxLength={280} multiline />
            <Toggle label="Open to everyone" hint={isPublic ? 'Anyone can find and join it.' : 'Only people you invite can join.'} value={isPublic} onChange={setIsPublic} />
            <View style={styles.row}>
              <Button label="Start the group" onPress={create} busy={busy} disabled={!title.trim()} />
              <Button variant="ghost" label="Cancel" onPress={() => setCreating(false)} />
            </View>
          </View>
        ) : (
          <Button label="Start a group" onPress={() => setCreating(true)} />
        )}

        {groups.length === 0 ? <Empty text="No open groups yet. Start the first one." /> : null}
        {groups.map((g) => (
          <Pressable key={g.id} style={styles.card} onPress={() => open(g)} accessibilityRole="button">
            <Text style={type.heading}>{g.title}</Text>
            {g.topic ? <Text style={type.body}>{g.topic}</Text> : null}
            <Text style={type.small}>
              {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
              {g.joined ? ' · you are in this group' : ' · tap to join'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
