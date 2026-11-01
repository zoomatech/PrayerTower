// Groups (Steve, 2026-10-31): open topic groups like Facebook groups, starting with Cancer
// survivors. Anyone can find and join one; any member can start one and leads it.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type TopicGroup } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function TopicGroups() {
  const t = useT();
  const [groups, setGroups] = useState<TopicGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.topicGroups().then(
      (r) => {
        setGroups(r.groups);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, []);
  useFocusEffect(load);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createTopicGroup(name.trim(), about.trim() || undefined);
      setCreating(false);
      setName('');
      setAbout('');
      router.push(`/topic-groups/${id}`);
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
        <Text style={type.title} role="heading">
          {t('topicGroups.title')}
        </Text>
        <Text style={type.small}>{t('topicGroups.intro')}</Text>
        <ErrorText error={error} onRetry={load} />
        {!groups && !error ? <Loading /> : null}
        {groups && !groups.length ? <Empty text={t('topicGroups.none')} /> : null}
        {groups?.map((g) => (
          <Pressable key={g.id} testID={`topic-group-${g.id}`} role="link" style={styles.card} onPress={() => router.push(`/topic-groups/${g.id}`)}>
            <Text style={type.heading}>{g.name}</Text>
            {g.about ? <Text style={type.body}>{g.about}</Text> : null}
            <Text style={type.small}>
              {t('topicGroups.members', { count: g.members })}
              {g.isLeader ? ` · ${t('topicGroups.youLead')}` : g.joined ? ` · ${t('topicGroups.joined')}` : ''}
            </Text>
          </Pressable>
        ))}
        {creating ? (
          <View style={styles.card}>
            <Field label={t('topicGroups.name')} value={name} onChangeText={setName} maxLength={60} />
            <Field label={t('topicGroups.about')} value={about} onChangeText={setAbout} maxLength={300} multiline />
            <View style={styles.row}>
              <Button small label={t('topicGroups.create')} busy={busy} disabled={!name.trim()} onPress={create} />
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => setCreating(false)} />
            </View>
          </View>
        ) : (
          <Button small variant="secondary" label={t('topicGroups.start')} testID="start-topic-group" onPress={() => setCreating(true)} />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
});
