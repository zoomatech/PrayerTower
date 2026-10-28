// Prayer & topical group chats (notebook Page 9, #6): find open groups or start one.
import type { PublicGroup } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function Groups() {
  const { t } = useLocale();
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
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} />
        <Text style={type.title}>{t('messages.groups')}</Text>
        <Text style={type.body}>{t('groups.intro')}</Text>
        <ErrorText error={error} />

        {creating ? (
          <View style={styles.card}>
            <Field label={t('groups.name')} placeholder={t('groups.namePlaceholder')} value={title} onChangeText={setTitle} maxLength={80} />
            <Field label={t('groups.topic')} placeholder={t('groups.topicPlaceholder')} value={topic} onChangeText={setTopic} maxLength={280} multiline />
            <Toggle label={t('groups.public')} hint={isPublic ? t('groups.publicHint') : t('groups.privateHint')} value={isPublic} onChange={setIsPublic} />
            <View style={styles.row}>
              <Button label={t('groups.create')} onPress={create} busy={busy} disabled={!title.trim()} />
              <Button variant="ghost" label={t('common.cancel')} onPress={() => setCreating(false)} />
            </View>
          </View>
        ) : (
          <Button label={t('groups.start')} onPress={() => setCreating(true)} />
        )}

        {groups.length === 0 ? <Empty text={t('groups.empty')} /> : null}
        {groups.map((g) => (
          <Pressable key={g.id} style={styles.card} onPress={() => open(g)} accessibilityRole="button">
            <Text style={type.heading}>{g.title}</Text>
            {g.topic ? <Text style={type.body}>{g.topic}</Text> : null}
            <Text style={type.small}>
              {t('groups.members', { count: g.memberCount })}
              {g.joined ? ` · ${t('groups.joined')}` : ` · ${t('groups.tapToJoin')}`}
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
