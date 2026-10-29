import { ENCOURAGEMENT_MAX_CHARS, isPrayable, MESSAGE_MAX_CHARS, type Card, type Comment, type FeedTheme, type TokenSummary } from '@prayer-tower/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { useCelebration } from '@/components/celebration';
import { CommentTree } from '@/components/comment-tree';
import { CrisisSupport } from '@/components/crisis';
import { GuestShare } from '@/components/guest-share';
import { PostCard } from '@/components/post-card';
import { SpokenPrayers } from '@/components/spoken-prayers';
import { AiPrayers } from '@/components/ai-prayers';
import { KindCloud } from '@/components/kind-cloud';
import { FollowupCard } from '@/components/followup-card';
import { HurtNote, WelcomeCard } from '@/components/gentle-repair';
import { ReplyHelpers } from '@/components/reply-helpers';
import { MeaningReactions, wordLeafTokens } from '@/components/meaning-reactions';
import { CircleGoal } from '@/components/circle-goal';
import { Button, Empty, ErrorText, Field, Loading, RulesWarning, Screen, Toggle } from '@/components/ui';
import { api, type PowerPrayerStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFeature } from '@/lib/community-features';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { shareLink } from '@/lib/links';
import { colors, space, type } from '@/lib/theme';
import { tabletTokens } from '@/layouts/tower';
import { vineTokens } from '@/layouts/vine';

export default function PostScreen() {
  const { id, celebrate: celebrateParam, comment: sharedCommentId } = useLocalSearchParams<{ id: string; celebrate?: string; comment?: string }>();
  const { celebrate, overlay } = useCelebration();
  const { profile, roles } = useAuth();
  const { t } = useLocale();
  const features = useFeatures();
  const { materialMatch, kindCloud } = features;
  // The comment tree and the emoji word leaves take their look from the member's feed skin.
  // The tree falls back to the vine's own colors; the word leaves stay plain chips without a skin.
  const [skin, setSkin] = useState<FeedTheme | null>(null);
  useEffect(() => {
    if (!features.commentTree && !features.meaningReactions) return;
    api
      .feedThemes()
      .then((r) => setSkin(r.theme ?? null))
      .catch(() => undefined);
  }, [features.commentTree, features.meaningReactions]);
  const treeTokens = useMemo(() => (skin?.layout === 'tower' ? tabletTokens(skin) : vineTokens(skin?.layout === 'vine' ? skin : null)), [skin]);
  const leafTokens = useMemo(() => wordLeafTokens(skin), [skin]);
  const [card, setCard] = useState<Card | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [prayers, setPrayers] = useState<{ count: number; people: { id: string | null; displayName: string }[] } | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Two taps to delete: the first asks "Tap again to delete".
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<TokenSummary | null>(null);
  const [radioSent, setRadioSent] = useState(false);
  const radioOn = useFeature('radio');
  const spokenOn = useFeature('spoken');
  const [power, setPower] = useState<PowerPrayerStatus | null>(null);
  const [powerSent, setPowerSent] = useState<number | null>(null);
  const [thanks, setThanks] = useState('');
  const [thanked, setThanked] = useState<number | null>(null);
  const [support, setSupport] = useState(false);
  // The answered / testimony panel: closed, or open with the draft text.
  const [testimony, setTestimony] = useState<string | null>(null);
  const [warnedFor, setWarnedFor] = useState<{ text: string; isUpdate: boolean } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [witnessNote, setWitnessNote] = useState('');
  const [witnessed, setWitnessed] = useState(false);
  const isWitness = roles.some((r) => r === 'witness' || r === 'moderator' || r === 'admin');
  const [note, setNote] = useState('');
  const [noteAnonymous, setNoteAnonymous] = useState(false);

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
      // With the kind cloud on, the cloud speaks while typing and nothing waits here.
      if (!confirmed && !kindCloud && (await api.precheck(text.trim())).warn) {
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

  // A private note to the requester; the server checks that the viewer prayed first.
  const sendNote = async () => {
    try {
      const r = await api.messageRequester(id, note.trim(), noteAnonymous);
      setNote('');
      setNoteOpen(false);
      router.push(`/conversation/${r.conversationId}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const markAnswered = async () => {
    try {
      const r = await api.markAnswered(id, testimony?.trim() || undefined);
      if (r.crisis) setSupport(true);
      setTestimony(null);
      celebrate();
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  };

  const saveTestimony = async () => {
    try {
      const r = await api.setTestimony(id, testimony!.trim());
      if (r.crisis) setSupport(true);
      setTestimony(null);
    } catch (e) {
      setError((e as Error).message);
    }
    load();
  };

  // Discussion, news and blog posts aren't prayed for: no answered/testimony, radio, Power Prayer or prayer list.
  const prayable = card ? isPrayable(card.postType) : true;

  // One comment's words and actions; the plain list and the comment tree both use it.
  const commentBody = (c: Comment, canReply: boolean) => (
    <>
      <Text style={styles.commentAuthor}>
        {c.isUpdate ? t('card.update') : ''}
        {c.author.displayName}
      </Text>
      <Text style={type.body}>{c.body}</Text>
      <View style={styles.row}>
        {canReply ? (
          <Text style={styles.reply} onPress={() => setReplyTo(c)}>
            {t('post.reply')}
          </Text>
        ) : null}
        <Text
          style={styles.reply}
          onPress={() =>
            // Shareable comments: the words plus a link that opens this request at the comment.
            Share.share({
              message: t('post.shareComment', { body: c.body, name: c.author.displayName, url: shareLink(`/post/${id}`, { comment: c.id }) }),
            }).catch(() => undefined)
          }
          accessibilityRole="button"
        >
          {t('post.share')}
        </Text>
        {card && !c.isMine && c.author.id !== profile?.id ? (
          <Text style={styles.report} onPress={() => openReport(card, { type: 'comment', id: c.id })}>
            {t('post.report')}
          </Text>
        ) : null}
        {c.isMine ? (
          <Text
            style={styles.report}
            accessibilityRole="button"
            onPress={() =>
              confirmDelete === c.id
                ? api
                    .deleteComment(c.id)
                    .then(() => {
                      setConfirmDelete(null);
                      load();
                    })
                    .catch((e) => setError((e as Error).message))
                : setConfirmDelete(c.id)
            }>
            {confirmDelete === c.id ? t('post.tapAgain') : t('post.deleteShort')}
          </Text>
        ) : null}
      </View>
      {card && !c.isMine && c.author.id !== profile?.id ? <HurtNote commentId={c.id} onReport={() => openReport(card, { type: 'comment', id: c.id })} /> : null}
    </>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        {card ? <PostCard card={card} onAction={onAction} expanded /> : null}
        {card ? <FollowupCard postId={card.id} isMine={card.isMine} onAnswered={() => load()} /> : null}
        {card ? <MeaningReactions postId={card.id} postBody={card.body} tokens={leafTokens} /> : null}
        {card?.crisis || support ? <CrisisSupport /> : null}
        <ErrorText error={error} onRetry={card ? undefined : load} />
        {!card && !error ? <Loading /> : null}

        {card && !card.isMine ? (
          <Text style={styles.report} onPress={() => openReport(card)} accessibilityRole="button">
            Report this request
          </Text>
        ) : null}
        {card?.isMine ? (
          <Text
            style={styles.report}
            accessibilityRole="button"
            onPress={() =>
              confirmDelete === card.id
                ? api
                    .deletePost(card.id)
                    .then(() => (router.canGoBack() ? router.back() : router.replace('/')))
                    .catch((e) => setError((e as Error).message))
                : setConfirmDelete(card.id)
            }>
            {confirmDelete === card.id ? t('post.deleteConfirm') : t('post.delete')}
          </Text>
        ) : null}

        {card && !card.isMine ? (
          noteOpen ? (
            <View style={styles.section}>
              <Text style={type.heading}>{t('post.writePrivately')}</Text>
              <Text style={type.small}>{t('post.privateNote')}</Text>
              <Field placeholder={t('post.notePlaceholder')} value={note} onChangeText={setNote} maxLength={MESSAGE_MAX_CHARS} multiline />
              <Toggle label={t('post.sendAnonymously')} value={noteAnonymous} onChange={setNoteAnonymous} />
              <View style={styles.noteRow}>
                <Button small label={t('actions.send')} onPress={sendNote} disabled={!note.trim()} />
                <Button small variant="ghost" label={t('common.cancel')} onPress={() => setNoteOpen(false)} />
              </View>
            </View>
          ) : (
            <Button variant="secondary" label={t('post.writePrivately')} onPress={() => setNoteOpen(true)} />
          )
        ) : null}

        {isWitness && card && !card.isMine ? (
          witnessed ? (
            <Text style={type.small}>{t('witness.marked')}</Text>
          ) : (
            <View style={styles.section}>
              <Text style={type.small}>{t('witness.markTitle')}</Text>
              <Field placeholder={t('witness.markPlaceholder')} value={witnessNote} onChangeText={setWitnessNote} maxLength={2000} />
              <Button
                small
                variant="secondary"
                label={t('witness.mark')}
                disabled={!witnessNote.trim()}
                onPress={() =>
                  api
                    .witnessFlag(id, witnessNote.trim())
                    .then(() => setWitnessed(true))
                    .catch((e) => setError((e as Error).message))
                }
              />
            </View>
          )
        ) : null}

        {!prayable ? null : card?.isMine && testimony !== null ? (
          <View style={{ gap: space.sm }}>
            <Field
              label={card.state === 'answered' ? t('post.testimonyLabel') : t('post.testimonyOptional')}
              placeholder={t('post.testimonyPlaceholder')}
              value={testimony}
              onChangeText={setTestimony}
              maxLength={2000}
              multiline
            />
            <View style={styles.row}>
              {card.state === 'answered' ? (
                <Button small label={t('post.testimonySave')} disabled={!testimony.trim()} onPress={saveTestimony} />
              ) : (
                <Button small label={t('post.markAnswered')} onPress={markAnswered} />
              )}
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => setTestimony(null)} />
            </View>
          </View>
        ) : card?.isMine && card.state !== 'answered' ? (
          <Button variant="secondary" label={t('post.markAnswered')} onPress={() => setTestimony('')} />
        ) : card?.isMine && card.state === 'answered' ? (
          <View style={styles.row}>
            <Button
              small
              variant="secondary"
              label={card.testimony ? t('post.testimonyEdit') : t('post.testimonyShare')}
              onPress={() => setTestimony(card.testimony ?? '')}
            />
            {card.testimony ? (
              <Button small variant="ghost" label={t('post.testimonyRemove')} onPress={() => api.removeTestimony(id).then(load, (e) => setError((e as Error).message))} />
            ) : null}
          </View>
        ) : null}

        {card && prayable ? <GuestShare card={card} /> : null}

        {card && prayable && spokenOn ? <SpokenPrayers postId={id} /> : null}
        {card && prayable ? <CircleGoal postId={id} /> : null}
        {card && prayable ? <AiPrayers postId={id} /> : null}

        {!prayable || !radioOn ? null : radioSent ? (
          <Text style={type.small}>{t('post.radioSent')}</Text>
        ) : tokens && tokens.priestly.balance >= tokens.priestly.radioPrayerCost ? (
          <Button
            variant="secondary"
            label={
              tokens.priestly.radioPrayerCost === 0
                ? t('post.radio')
                : t('post.radioCost', { count: tokens.priestly.radioPrayerCost })
            }
            onPress={() => sendRadio()}
          />
        ) : null}
        {prayable && !radioSent && materialMatch && (tokens?.priestly.radioPrayerCost ?? 0) > 0 ? <Text style={type.small}>{t('post.materialMatch')}</Text> : null}
        {prayable && radioOn && !radioSent && tokens?.priestly.amplifyRepeats && tokens.priestly.balance >= (tokens.priestly.amplifyCost ?? 0) ? (
          <Button
            variant="secondary"
            label={
              tokens.priestly.amplifyCost
                ? t('post.amplifyCost', { count: tokens.priestly.amplifyRepeats, cost: tokens.priestly.amplifyCost })
                : t('post.amplify', { count: tokens.priestly.amplifyRepeats })
            }
            onPress={() => sendRadio(true)}
          />
        ) : null}

        {!prayable ? null : powerSent !== null ? (
          <Text style={type.small}>
            {powerSent === 0
              ? t('post.powerNone')
              : t(card?.isMine ? 'post.powerSentYou' : 'post.powerSentThem', { count: powerSent })}
          </Text>
        ) : power?.blockedReason && card && !card.isMine ? (
          <Text style={type.small}>{t('post.powerBlocked', { reason: power.blockedReason })}</Text>
        ) : power && card && !power.blockedReason && (power.cost === 0 || (tokens?.balance ?? 0) >= power.cost) ? (
          <Button
            variant="secondary"
            label={power.cost === 0 ? t('post.powerFree', { count: power.reach }) : t('post.powerCost', { count: power.reach, cost: power.cost })}
            onPress={sendPower}
          />
        ) : null}

        {prayable && prayers ? (
          <View style={styles.section}>
            <Text style={type.heading}>
              {t('post.prayed', { count: prayers.count })}
            </Text>
            {prayers.people.length > 0 ? (
              <Text style={type.body}>{prayers.people.map((p) => p.displayName).join(', ')}</Text>
            ) : null}
            {card?.isMine && prayers.count > 0 ? (
              thanked !== null ? (
                <Text style={type.small}>
                  {t('post.thanked', { count: thanked })}
                </Text>
              ) : (
                <View style={styles.section}>
                  <Field
                    placeholder={t('post.thanksPlaceholder')}
                    value={thanks}
                    onChangeText={setThanks}
                    maxLength={ENCOURAGEMENT_MAX_CHARS}
                  />
                  <Button
                    small
                    variant="secondary"
                    label={t('post.thankEveryone')}
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

        {/* Comments and the reply box only once the request itself has loaded. */}
        {card ? (
          <>
            <View style={styles.section}>
              <Text style={type.heading}>{t('post.comments')}</Text>
              {comments.length === 0 ? <Empty text={t('post.noComments')} /> : null}
              {features.commentTree ? (
                <CommentTree
                  comments={comments}
                  tokens={treeTokens}
                  leavesShown={features.commentTreeLeaves}
                  maxDepth={features.commentTreeMaxDepth}
                  highlightId={sharedCommentId ?? null}
                  renderBody={commentBody}
                />
              ) : (
                comments.map((c) => (
                  <View
                    key={c.id}
                    style={[styles.comment, { marginLeft: Math.min(c.depth ?? 0, 4) * space.lg }, c.id === sharedCommentId && styles.sharedComment]}
                  >
                    {commentBody(c, true)}
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              {replyTo ? (
                <Text style={type.small} onPress={() => setReplyTo(null)}>
                  {t('post.replyingTo', { name: replyTo.author.displayName })}
                </Text>
              ) : null}
              <WelcomeCard />
              <Field placeholder={t('post.commentPlaceholder')} value={text} onChangeText={setText} multiline maxLength={5000} />
              <KindCloud text={text} />
              <ReplyHelpers
                // Answer the comment being replied to, or else the request itself.
                lastFromOther={(replyTo && !replyTo.isMine ? replyTo.body : null) ?? (card.isMine ? null : card.body)}
                empty={false}
                text={text}
                onPick={setText}
              />
              {warnedFor && warnedFor.text === text ? <RulesWarning busy={busy} onPostAnyway={() => send(warnedFor.isUpdate, true)} /> : null}
              <View style={styles.row}>
                <Button small label={t('post.comment')} onPress={() => send(false)} busy={busy} disabled={!text.trim()} />
                {card?.isMine ? <Button small variant="secondary" label={t('post.postUpdate')} onPress={() => send(true)} disabled={!text.trim()} /> : null}
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
      {sheets}
      {overlay}
    </Screen>
  );
}

const styles = StyleSheet.create({
  noteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  section: { gap: space.sm },
  comment: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.md, gap: 2 },
  sharedComment: { borderLeftColor: colors.primary, backgroundColor: colors.primarySoft, paddingVertical: space.xs },
  commentAuthor: { fontWeight: '700', color: colors.text },
  reply: { color: colors.primary, fontSize: 13 },
  report: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
});
