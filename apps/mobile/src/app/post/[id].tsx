import { ENCOURAGEMENT_MAX_CHARS, type Card, type Comment, type TokenSummary } from '@prayer-tower/shared';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { useCelebration } from '@/components/celebration';
import { CrisisSupport } from '@/components/crisis';
import { PostCard } from '@/components/post-card';
import { Button, Empty, ErrorText, Field, RulesWarning, Screen } from '@/components/ui';
import { api, type PowerPrayerStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, space, type } from '@/lib/theme';

export default function PostScreen() {
  const { id, celebrate: celebrateParam, comment: sharedCommentId } = useLocalSearchParams<{ id: string; celebrate?: string; comment?: string }>();
  const { celebrate, overlay } = useCelebration();
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
  const [power, setPower] = useState<PowerPrayerStatus | null>(null);
  const [powerSent, setPowerSent] = useState<number | null>(null);
  const [thanks, setThanks] = useState('');
  const [thanked, setThanked] = useState<number | null>(null);
  const [support, setSupport] = useState(false);
  const [warnedFor, setWarnedFor] = useState<{ text: string; isUpdate: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, c, pr, t, pw] = await Promise.all([api.post(id), api.comments(id), api.prayers(id), api.tokens(), api.powerPrayerStatus()]);
      setPower(pw);
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

  useEffect(() => {
    if (celebrateParam) celebrate();
  }, [celebrateParam, celebrate]);

  const { onAction, openReport, sheets } = useCardActions(load);

  const send = async (isUpdate = false, confirmed = false) => {
    setBusy(true);
    setError(null);
    try {
      if (!confirmed && (await api.precheck(text.trim())).warn) {
        setWarnedFor({ text, isUpdate });
        return;
      }
      setWarnedFor(null);
      const r = await api.addComment(id, text.trim(), { parentId: replyTo?.id, isUpdate });
      if (r.comment.crisis) setSupport(true);
      setText('');
      setReplyTo(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendRadio = async (amplify = false) => {
    try {
      await api.sendRadioPrayer(id, amplify);
      setRadioSent(true);
      setTokens(await api.tokens());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // Power Prayer: ask live pray-ers who don't know the poster.
  const sendPower = async () => {
    try {
      const r = await api.powerPrayer(id);
      setPowerSent(r.powerPrayer.reached);
      setPower(r.next);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const markAnswered = async () => {
    try {
      await api.markAnswered(id);
      celebrate();
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        {card ? <PostCard card={card} onAction={onAction} expanded /> : null}
        {card?.crisis || support ? <CrisisSupport /> : null}
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
            label={
              tokens.priestly.radioPrayerCost === 0
                ? 'Send as a radio prayer'
                : `Send as a radio prayer (${tokens.priestly.radioPrayerCost} Priestly token${tokens.priestly.radioPrayerCost === 1 ? '' : 's'})`
            }
            onPress={() => sendRadio()}
          />
        ) : null}
        {!radioSent && tokens?.priestly.amplifyRepeats ? (
          <Button variant="secondary" label={`Amplify: send it out by radio ${tokens.priestly.amplifyRepeats} times (free)`} onPress={() => sendRadio(true)} />
        ) : null}

        {powerSent !== null ? (
          <Text style={type.small}>
            {powerSent === 0
              ? 'Thank you. Everyone we could ask has already been asked or has prayed; your tokens still extend its reach.'
              : `Thank you. We asked ${powerSent} ${powerSent === 1 ? 'person' : 'people'} who don't know ${card?.isMine ? 'you' : 'them'} yet to pray.`}
          </Text>
        ) : power?.blockedReason && card && !card.isMine ? (
          <Text style={type.small}>Power Prayer: {power.blockedReason}</Text>
        ) : power && card && !power.blockedReason && (power.cost === 0 || (tokens?.balance ?? 0) >= power.cost) ? (
          <Button
            variant="secondary"
            label={`Power Prayer: ask ${power.reach} more people to pray (${power.cost === 0 ? 'free this week' : `${power.cost} tokens`})`}
            onPress={sendPower}
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
            <View
              key={c.id}
              style={[styles.comment, { marginLeft: Math.min(c.depth ?? 0, 4) * space.lg }, c.id === sharedCommentId && styles.sharedComment]}
            >
              <Text style={styles.commentAuthor}>
                {c.isUpdate ? 'Update · ' : ''}
                {c.author.displayName}
              </Text>
              <Text style={type.body}>{c.body}</Text>
              <View style={styles.row}>
                <Text style={styles.reply} onPress={() => setReplyTo(c)}>
                  Reply
                </Text>
                <Text
                  style={styles.reply}
                  onPress={() =>
                    // Shareable comments: the words plus a link that opens this request at the comment.
                    Share.share({
                      message: `“${c.body}” (${c.author.displayName}, on a Prayer Tower request) ${Linking.createURL(`/post/${id}`, { queryParams: { comment: c.id } })}`,
                    }).catch(() => undefined)
                  }
                  accessibilityRole="button"
                >
                  Share
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
          {warnedFor && warnedFor.text === text ? <RulesWarning busy={busy} onPostAnyway={() => send(warnedFor.isUpdate, true)} /> : null}
          <View style={styles.row}>
            <Button small label="Comment" onPress={() => send(false)} busy={busy} disabled={!text.trim()} />
            {card?.isMine ? <Button small variant="secondary" label="Post as an update" onPress={() => send(true)} disabled={!text.trim()} /> : null}
          </View>
        </View>
      </ScrollView>
      {sheets}
      {overlay}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  section: { gap: space.sm },
  comment: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.md, gap: 2 },
  sharedComment: { borderLeftColor: colors.primary, backgroundColor: colors.primarySoft, paddingVertical: space.xs },
  commentAuthor: { fontWeight: '700', color: colors.text },
  reply: { color: colors.primary, fontSize: 13 },
  report: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
