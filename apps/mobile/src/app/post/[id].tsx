import { ENCOURAGEMENT_MAX_CHARS, type Card, type Comment, type TokenSummary } from '@prayer-tower/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { PostCard } from '@/components/post-card';
import { Button, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space, type } from '@/lib/theme';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [card, setCard] = useState<Card | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [prayers, setPrayers] = useState<{ count: number; people: { id: string | null; displayName: string }[] } | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<TokenSummary | null>(null);
  const [radioSent, setRadioSent] = useState(false);
  const [thanks, setThanks] = useState('');
  const [thanked, setThanked] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, pr, t] = await Promise.all([api.post(id), api.comments(id), api.prayers(id), api.tokens()]);
      setTokens(t);
      setCard(p.post);
      setComments(c.comments);
      setPrayers(pr);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const { onAction, openReport, sheets } = useCardActions(load);

  const send = async (isUpdate = false) => {
    setBusy(true);
    setError(null);
    try {
      await api.addComment(id, text.trim(), { parentId: replyTo?.id, isUpdate });
      setText('');
      setReplyTo(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendRadio = async () => {
    try {
      await api.sendRadioPrayer(id);
      setRadioSent(true);
      setTokens(await api.tokens());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const markAnswered = async () => {
    await api.markAnswered(id).catch((e) => setError((e as Error).message));
    load();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        {card ? <PostCard card={card} onAction={onAction} expanded /> : null}
        <ErrorText error={error} />

        {card && !card.isMine ? (
          <Text style={styles.report} onPress={() => openReport(card)} accessibilityRole="button">
            Report this request
          </Text>
        ) : null}

        {card?.isMine && card.state !== 'answered' ? (
          <Button variant="secondary" label="Mark this prayer answered" onPress={markAnswered} />
        ) : null}

        {radioSent ? (
          <Text style={type.small}>Sent. This request is going out as a radio prayer.</Text>
        ) : tokens && tokens.priestly.balance >= tokens.priestly.radioPrayerCost ? (
          <Button
            variant="secondary"
            label={`Send as a radio prayer (${tokens.priestly.radioPrayerCost} Priestly token${tokens.priestly.radioPrayerCost === 1 ? '' : 's'})`}
            onPress={sendRadio}
          />
        ) : null}

        {prayers ? (
          <View style={styles.section}>
            <Text style={type.heading}>
              {prayers.count === 0 ? 'No one has prayed yet' : `${prayers.count} ${prayers.count === 1 ? 'person has' : 'people have'} prayed`}
            </Text>
            {prayers.people.length > 0 ? (
              <Text style={type.body}>{prayers.people.map((p) => p.displayName).join(', ')}</Text>
            ) : null}
            {card?.isMine && prayers.count > 0 ? (
              thanked !== null ? (
                <Text style={type.small}>
                  Your thanks went to {thanked} {thanked === 1 ? 'person' : 'people'}.
                </Text>
              ) : (
                <View style={styles.section}>
                  <Field
                    placeholder="A short thank-you (optional)"
                    value={thanks}
                    onChangeText={setThanks}
                    maxLength={ENCOURAGEMENT_MAX_CHARS}
                  />
                  <Button
                    small
                    variant="secondary"
                    label="Thank everyone who prayed"
                    onPress={() =>
                      api
                        .thankEveryone(id, thanks.trim())
                        .then((r) => setThanked(r.sent))
                        .catch((e) => setError((e as Error).message))
                    }
                  />
                </View>
              )
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={type.heading}>Comments</Text>
          {comments.length === 0 ? <Empty text="No comments yet." /> : null}
          {comments.map((c) => (
            <View key={c.id} style={[styles.comment, { marginLeft: Math.min(c.depth ?? 0, 4) * space.lg }]}>
              <Text style={styles.commentAuthor}>
                {c.isUpdate ? 'Update · ' : ''}
                {c.author.displayName}
              </Text>
              <Text style={type.body}>{c.body}</Text>
              <View style={styles.row}>
                <Text style={styles.reply} onPress={() => setReplyTo(c)}>
                  Reply
                </Text>
                {card && c.author.id !== profile?.id ? (
                  <Text style={styles.report} onPress={() => openReport(card, { type: 'comment', id: c.id })}>
                    Report
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          {replyTo ? (
            <Text style={type.small} onPress={() => setReplyTo(null)}>
              Replying to {replyTo.author.displayName} (tap to cancel)
            </Text>
          ) : null}
          <Field placeholder="Write a comment" value={text} onChangeText={setText} multiline maxLength={5000} />
          <View style={styles.row}>
            <Button small label="Comment" onPress={() => send(false)} busy={busy} disabled={!text.trim()} />
            {card?.isMine ? <Button small variant="secondary" label="Post as an update" onPress={() => send(true)} disabled={!text.trim()} /> : null}
          </View>
        </View>
      </ScrollView>
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  section: { gap: space.sm },
  comment: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.md, gap: 2 },
  commentAuthor: { fontWeight: '700', color: colors.text },
  reply: { color: colors.primary, fontSize: 13 },
  report: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
