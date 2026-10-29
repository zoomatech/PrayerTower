// One prayer circle's gentle feed, newest first, with the kindness tools: the kind cloud on
// every post and reply, reply starters, and a single "I prayed" action. Only the person who
// asked sees how many prayed. The circle's starter can invite, take a post down or remove
// someone; nothing is ever removed by the app on its own.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { KindCloud } from '@/components/kind-cloud';
import { ReplyHelpers } from '@/components/reply-helpers';
import { Button, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type CirclePost, type CircleView } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

function PostItem({ p, view, onChange }: { p: CirclePost; view: CircleView; onChange: () => void }) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mine = p.prayed !== undefined;
  const canRemove = mine || view.circle.isOwner;
  const act = (fn: () => Promise<unknown>, said?: string) =>
    fn().then(
      () => {
        if (said) announce(said);
        onChange();
      },
      (e) => setError((e as Error).message),
    );
  return (
    <View style={styles.card} testID={`circle-post-${p.id}`}>
      <Text style={type.small}>
        {p.author.displayName ?? ''} · {day(p.createdAt)}
      </Text>
      <Text style={type.body}>{p.body}</Text>
      {mine ? (
        p.prayed ? <Text style={type.small}>{t('circles.prayedCount', { count: p.prayed })}</Text> : null
      ) : p.prayedByMe ? (
        <Text style={type.small}>🙏 {t('circles.prayed')}</Text>
      ) : (
        <Button small variant="secondary" label={`🙏 ${t('circles.pray')}`} testID={`circle-pray-${p.id}`} onPress={() => act(() => api.circlePray(p.id), t('circles.prayedNote'))} />
      )}
      {p.replies.map((r) => (
        <View key={r.id} style={styles.reply}>
          <Text style={type.small}>{r.author.displayName ?? ''}</Text>
          <Text style={type.body}>{r.body}</Text>
        </View>
      ))}
      {draft === null ? (
        <View style={styles.row}>
          <Button small variant="ghost" label={t('circles.reply')} onPress={() => setDraft('')} />
          {canRemove ? <Button small variant="ghost" label={t('circles.remove')} onPress={() => act(() => api.removeCirclePost(p.id))} /> : null}
        </View>
      ) : (
        <>
          <ReplyHelpers lastFromOther={p.body} empty={!p.replies.length} text={draft} onPick={setDraft} postType="request" />
          <Field label={t('circles.replyLabel')} value={draft} onChangeText={setDraft} maxLength={1000} multiline />
          <KindCloud text={draft} />
          <View style={styles.row}>
            <Button
              small
              label={t('circles.send')}
              disabled={!draft.trim()}
              onPress={() =>
                act(async () => {
                  await api.circleReply(p.id, draft.trim());
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

export default function Circle() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<CircleView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.circle(id).then(
      (r) => {
        setView(r);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, [id]);
  useEffect(load, [load]);

  const share = async () => {
    setBusy(true);
    try {
      await api.circlePost(id, body.trim());
      setBody('');
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const c = view?.circle;
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/circles'))} />
        <ErrorText error={error} onRetry={load} />
        {!view && !error ? <Loading /> : null}
        {view && c ? (
          <>
            <Text style={type.title} role="heading">
              {c.name}
            </Text>
            {c.about ? <Text style={type.body}>{c.about}</Text> : null}
            <View style={styles.card}>
              <Text style={type.heading} role="heading">
                {t('circles.share')}
              </Text>
              <Field label={t('circles.shareLabel')} value={body} onChangeText={setBody} maxLength={2000} multiline />
              <KindCloud text={body} />
              <Button small label={t('circles.post')} busy={busy} disabled={!body.trim()} onPress={share} />
            </View>
            {!view.posts.length ? <Empty text={t('circles.empty')} /> : null}
            {view.posts.map((p) => (
              <PostItem key={p.id} p={p} view={view} onChange={load} />
            ))}
            <View style={styles.card}>
              <Text style={type.heading} role="heading">
                {t('circles.memberList')}
              </Text>
              {view.members.map((m) => (
                <View key={m.id} style={styles.row}>
                  <Text style={[type.body, styles.grow]}>{m.displayName ?? ''}</Text>
                  {c.isOwner && m.id !== c.ownerId ? (
                    <Button small variant="ghost" label={t('circles.removeMember')} onPress={() => api.removeCircleMember(id, m.id).then(load, (e) => setError((e as Error).message))} />
                  ) : null}
                </View>
              ))}
              {c.isOwner ? (
                c.full ? (
                  <Text style={type.small}>{t('circles.full')}</Text>
                ) : (
                  <>
                    {view.invite ? (
                      <>
                        <Text style={type.heading} selectable testID="circle-invite-code">
                          {t('circles.inviteCode', { code: view.invite.code })}
                        </Text>
                        <Text style={type.small}>{t('circles.inviteHint', { date: day(view.invite.expiresAt) })}</Text>
                      </>
                    ) : null}
                    <Button small variant="secondary" label={t(view.invite ? 'circles.newInvite' : 'circles.invite')} onPress={() => api.circleInvite(id).then(load, (e) => setError((e as Error).message))} />
                  </>
                )
              ) : null}
              <Button small variant="ghost" label={t('circles.leave')} onPress={() => api.leaveCircle(id).then(() => router.replace('/circles'), (e) => setError((e as Error).message))} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  reply: { gap: 2, paddingLeft: space.md, borderLeftWidth: 2, borderLeftColor: colors.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
});
