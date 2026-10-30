// Messages tab (Features Set 2): notes between pray-ers and the people they
// prayed for, direct messages, and prayer & topical group chats. Message
// requests and group invites come first.
import type { ConversationSummary } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ConversationPane } from '@/components/conversation-pane';
import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeature } from '@/lib/community-features';
import { useLocale } from '@/lib/i18n';
import { breakpoints, colors, radius, space, type } from '@/lib/theme';

// On wide windows (iPad, Mac) the list sits on the left and the open conversation beside it.
const LIST_WIDTH = 360;


export default function Messages() {
  const { t } = useLocale();
  const groupsOn = useFeature('groups');
  const eventsOn = useFeature('events');
  const careOn = useFeature('care');
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const split = useWindowDimensions().width >= breakpoints.split;
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems((await api.conversations()).conversations);
      setLoaded(true);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const requests = items.filter((c) => c.isRequest);
  const rest = items.filter((c) => !c.isRequest);

  // In the split view, show the first conversation until one is picked.
  const shown = split ? (items.find((c) => c.id === openId) ?? items[0] ?? null) : null;

  const row = (c: ConversationSummary) => (
    <Pressable
      key={c.id}
      style={[styles.item, c.unread > 0 && styles.unread, shown?.id === c.id && styles.selected]}
      onPress={() => (split ? setOpenId(c.id) : router.push(`/conversation/${c.id}`))}
      accessibilityRole={split ? 'button' : 'link'}
      aria-selected={split ? shown?.id === c.id : undefined}>
      <View style={styles.rowTop}>
        <Text style={styles.title} numberOfLines={1}>
          {c.title}
        </Text>
        <Text style={type.script}>{t(`messages.kinds.${c.kind}`)}</Text>
      </View>
      {c.kind === 'group' ? (
        <Text style={type.small}>
          {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
          {c.isPublic ? ' · open to all' : ' · invite only'}
        </Text>
      ) : null}
      {c.lastMessage ? (
        <Text style={type.body} numberOfLines={2}>
          {c.lastMessage}
        </Text>
      ) : null}
      {c.unread > 0 ? <Text style={styles.badge}>{c.unread} new</Text> : null}
    </Pressable>
  );

  const list = (
    <ScrollView
      style={split ? styles.list : undefined}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
      <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      <Text style={type.title}>{t('tabs.messages')}</Text>
      <Text style={type.small}>{t('messages.privacy')}</Text>
      <View style={styles.links}>
        {groupsOn ? <Button variant="secondary" label={t('messages.groups')} onPress={() => router.push('/groups')} /> : null}
        {eventsOn ? <Button variant="secondary" label={t('messages.events')} onPress={() => router.push('/events')} /> : null}
        {careOn ? <Button variant="secondary" label={t('messages.care')} onPress={() => router.push('/care')} /> : null}
      </View>
      <ErrorText error={error} onRetry={load} />
      {!loaded && !error ? <Loading /> : null}
      {requests.length ? <Text style={type.heading}>{t('messages.requests')}</Text> : null}
      {requests.map(row)}
      {requests.length && rest.length ? <Text style={type.heading}>{t('messages.conversations')}</Text> : null}
      {rest.map(row)}
      {loaded && items.length === 0 ? (
        <Empty text={t('messages.empty')} />
      ) : null}
    </ScrollView>
  );

  if (!split) return <Screen>{list}</Screen>;
  return (
    <Screen style={styles.splitScreen}>
      {list}
      <View style={styles.pane}>
        {shown ? (
          <ConversationPane
            key={shown.id}
            id={shown.id}
            onClose={() => {
              setOpenId(null);
              load();
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: 4 },
  unread: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  splitScreen: { maxWidth: 1200, flexDirection: 'row' },
  list: { width: LIST_WIDTH, flexGrow: 0, borderRightWidth: 1, borderRightColor: colors.border },
  pane: { flex: 1, minWidth: 0 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, fontWeight: '700', fontSize: 16, color: colors.text },
  badge: { alignSelf: 'flex-start', color: '#fff', backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: space.sm, fontSize: 12, overflow: 'hidden' },
});
