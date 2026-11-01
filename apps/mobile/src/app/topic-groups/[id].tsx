// One group's page (Steve, 2026-10-31: like Facebook groups, a feed, not a chat room): what it's
// for, who leads it, and its feed, newest first. Members share, comment and pray, with the kind
// cloud on everything they write. The author, the leader or a moderator can take a post down.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { KindCloud } from '@/components/kind-cloud';
import { Button, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type TopicGroupPost, type TopicGroupView } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

function PostItem({ p, joined, onChange }: { p: TopicGroupPost; joined: boolean; onChange: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<unknown>, said?: string) =>
    fn().then(
      () => {
        if (said) announce(said);
        onChange();
      },
      (e) => setError((e as Error).message),
    );
  return (
    <View style={styles.card} testID={`topic-group-post-${p.id}`}>
      <Text style={type.small}>
        {p.author.displayName ?? ''} · {day(p.createdAt)}
      </Text>
      <Text style={type.body}>{p.body}</Text>
      <View style={styles.row}>
        {p.prayed ? <Text style={type.small}>{t('topicGroups.prayedCount', { count: p.prayed })}</Text> : null}
        {p.prayedByMe ? (
          <Text style={type.small}>🙏 {t('topicGroups.prayed')}</Text>
        ) : joined ? (
          <Button small variant="secondary" label={`🙏 ${t('topicGroups.pray')}`} testID={`topic-group-pray-${p.id}`} onPress={() => act(() => api.topicGroupPray(p.id), t('topicGroups.prayedNote'))} />
        ) : null}
      </View>
      {p.comments.map((c) => (
        <View key={c.id} style={styles.comment}>
          <Text style={type.small}>{c.author.displayName ?? ''}</Text>
          <Text style={type.body}>{c.body}</Text>
          {c.canRemove ? <Button small variant="ghost" label={t('topicGroups.remove')} onPress={() => act(() => api.removeTopicGroupComment(c.id))} /> : null}
        </View>
      ))}
      {draft === null ? (
        <View style={styles.row}>
          {joined ? <Button small variant="ghost" label={t('topicGroups.comment')} onPress={() => setDraft('')} /> : null}
          {p.canRemove ? <Button small variant="ghost" label={t('topicGroups.remove')} onPress={() => act(() => api.removeTopicGroupPost(p.id))} /> : null}
        </View>
      ) : (
        <>
          <Field label={t('topicGroups.commentLabel')} value={draft} onChangeText={setDraft} maxLength={1000} multiline />
          <KindCloud text={draft} />
          <View style={styles.row}>
            <Button
              small
              label={t('topicGroups.send')}
              disabled={!draft.trim()}
              onPress={() =>
                act(async () => {
                  await api.topicGroupComment(p.id, draft.trim());
                  setDraft(null);
                })
              }
            />
            <Button small variant="ghost" label={t('common.cancel')} onPress={() => setDraft(null)} />
          </View>
        </>
      )}
      <ErrorText error={error} />
    </View>
  );
}

export default function TopicGroupPage() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<TopicGroupView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.topicGroup(id).then(
      (r) => {
        setView(r);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, [id]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const g = view?.group;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/topic-groups'))} />
        <ErrorText error={error} onRetry={load} />
        {!view && !error ? <Loading /> : null}
        {view && g ? (
          <>
            <Text style={type.title} role="heading">
              {g.name}
            </Text>
            {g.about ? <Text style={type.body}>{g.about}</Text> : null}
            <Text style={type.small}>
              {t('topicGroups.members', { count: g.members })}
              {g.isLeader ? ` · ${t('topicGroups.youLead')}` : g.leader?.displayName ? ` · ${t('topicGroups.leader', { name: g.leader.displayName })}` : ''}
            </Text>
            {g.joined ? (
              <View style={styles.card}>
                <Text style={type.heading} role="heading">
                  {t('topicGroups.share')}
                </Text>
                <Field label={t('topicGroups.shareLabel')} value={body} onChangeText={setBody} maxLength={2000} multiline />
                <KindCloud text={body} />
                <Button
                  small
                  label={t('topicGroups.post')}
                  busy={busy}
                  disabled={!body.trim()}
                  onPress={() =>
                    run(async () => {
                      await api.topicGroupPost(id, body.trim());
                      setBody('');
                    })
                  }
                />
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={type.body}>{t('topicGroups.joinToShare')}</Text>
                <Button small label={t('topicGroups.join')} busy={busy} testID="join-topic-group" onPress={() => run(() => api.joinTopicGroup(id))} />
              </View>
            )}
            {!view.posts.length ? <Empty text={t('topicGroups.empty')} /> : null}
            {view.posts.map((p) => (
              <PostItem key={p.id} p={p} joined={g.joined} onChange={load} />
            ))}
            {g.joined ? <Button small variant="ghost" label={t('topicGroups.leave')} onPress={() => run(() => api.leaveTopicGroup(id))} /> : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  comment: { gap: 2, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: colors.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
});
