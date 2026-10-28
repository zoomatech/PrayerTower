// Prayer groups: the member's groups, public groups to join, joining a
// private group by invite code, and starting a new group.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Field, Screen, Toggle } from '@/components/ui';
import { api, type PrayerGroup } from '@/lib/api';
import { colors, radius, space, type } from '@/lib/theme';

export default function GroupsScreen() {
  const [data, setData] = useState<{ mine: PrayerGroup[]; discover: PrayerGroup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    api
      .groups()
      .then(setData, (e) => setError((e as Error).message))
      .finally(() => setRefreshing(false));
  }, []);
  useFocusEffect(load);

  const act = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setError(null);
    try {
      const id = await fn();
      if (id) router.push(`/groups/${id}`);
      else load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const row = (g: PrayerGroup, join = false) => (
    <Pressable
      key={g.id}
      style={[styles.item, g.unread && styles.unread]}
      onPress={() => (join ? undefined : router.push(`/groups/${g.id}`))}
      accessibilityRole={join ? undefined : 'link'}
    >
      <Text style={styles.name}>
        {g.name}
        {g.isPrivate ? ' · private' : ''}
      </Text>
      {g.purpose ? <Text style={type.body}>{g.purpose}</Text> : null}
      <Text style={type.small}>
        {g.members} {g.members === 1 ? 'member' : 'members'}
        {g.role === 'leader' ? ' · you lead this group' : ''}
      </Text>
      {join ? <Button small variant="secondary" label="Join" onPress={() => act(() => api.joinGroup(g.id).then(() => g.id))} /> : null}
    </Pressable>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>Prayer groups</Text>
        <Text style={type.small}>Pray together: a group chat and a shared prayer list.</Text>
        <ErrorText error={error} />

        <Text style={type.heading}>Your groups</Text>
        {data?.mine.length === 0 ? <Empty text="You are not in a group yet." /> : null}
        {data?.mine.map((g) => row(g))}

        <View style={styles.box}>
          <Text style={type.heading}>Have an invite code?</Text>
          <Field placeholder="Invite code" value={code} onChangeText={setCode} autoCapitalize="none" />
          <Button small variant="secondary" label="Join with code" disabled={!code.trim()} busy={busy} onPress={() => act(() => api.joinGroupByCode(code.trim()).then((r) => r.id))} />
        </View>

        {data && data.discover.length > 0 ? <Text style={type.heading}>Groups you can join</Text> : null}
        {data?.discover.map((g) => row(g, true))}

        <View style={styles.box}>
          <Text style={type.heading}>Start a group</Text>
          <Field placeholder="Name, e.g. Moms praying for prodigals" value={name} onChangeText={setName} maxLength={60} />
          <Field placeholder="What the group prays for (optional)" value={purpose} onChangeText={setPurpose} maxLength={500} multiline />
          <Toggle label="Private (invite code only)" value={isPrivate} onChange={setPrivate} />
          <Button
            small
            label="Start group"
            disabled={!name.trim()}
            busy={busy}
            onPress={() => act(() => api.createGroup({ name: name.trim(), purpose: purpose.trim(), isPrivate }).then((r) => r.id))}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: 4 },
  unread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  name: { fontWeight: '700', fontSize: 16, color: colors.text },
  box: { gap: space.sm, paddingTop: space.md },
});
