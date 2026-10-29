// Kind norms (docs/KIND_NORMS.md), each off until Admin → Kind norms turns it on:
// the kindness promise card on the feed, the reminder and "resting" notes above the
// reply box, the "This helped" button on comments, and "Offer a private sorry" on your
// own comment after someone sent a gentle note about it. None of them blocks anything.
import type { Comment } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

/** Once per member: a short promise to be kind. "Not now" puts it away until next time. */
export function KindnessPromise() {
  const { kindnessPromise } = useFeatures();
  const t = useT();
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<'ask' | 'thanks' | 'hidden'>('hidden');

  useEffect(() => {
    if (!kindnessPromise) return;
    let live = true;
    api.kindnessPromise().then(
      (r) => {
        if (!live || !r.enabled || r.agreed) return;
        setText(r.text);
        setState('ask');
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [kindnessPromise]);

  if (!kindnessPromise || state === 'hidden') return null;
  if (state === 'thanks') return <Text style={type.small}>{t('kindNorms.promiseThanks')}</Text>;
  const agree = () => {
    setState('thanks');
    announce(t('kindNorms.promiseThanks'));
    api.agreeKindnessPromise().catch(() => undefined);
  };
  return (
    <View style={styles.card} testID="kindness-promise">
      <Text style={type.heading}>{t('kindNorms.promiseTitle')}</Text>
      <Text style={type.body}>{text || t('kindNorms.promiseDefault')}</Text>
      <View style={styles.row}>
        <Button small label={t('kindNorms.promiseAgree')} onPress={agree} />
        <Button small variant="ghost" label={t('kindNorms.promiseLater')} onPress={() => setState('hidden')} />
      </View>
    </View>
  );
}

/** Above the reply box: the reminder on a member's first replies, and a resting thread's note. `nudge` re-checks after a send. */
export function ReplyNotes({ postId, nudge = 0 }: { postId: string; nudge?: number }) {
  const { replyReminder, restingThreads } = useFeatures();
  const t = useT();
  const [box, setBox] = useState<{ reminder: boolean; resting: { gapMinutes: number } | null } | null>(null);

  useEffect(() => {
    if (!replyReminder && !restingThreads) return;
    let live = true;
    api.replyBox(postId).then(
      (r) => live && setBox(r),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [postId, nudge, replyReminder, restingThreads]);

  if (!box) return null;
  return (
    <>
      {restingThreads && box.resting ? (
        <Text style={[type.small, styles.resting]} role="status" testID="resting-note">
          {t('kindNorms.resting', { minutes: box.resting.gapMinutes })}
        </Text>
      ) : null}
      {replyReminder && box.reminder ? <Text style={type.small}>{t('kindNorms.reminder')}</Text> : null}
    </>
  );
}

/** "This helped" on someone else's comment, and the note when many kinds of members found it helpful. */
export function HelpedButton({ comment }: { comment: Comment }) {
  const { thisHelped } = useFeatures();
  const t = useT();
  const [on, setOn] = useState(!!comment.helped);
  useEffect(() => setOn(!!comment.helped), [comment.helped]);
  if (!thisHelped) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    api.setHelped(comment.id, next).catch(() => setOn(!next));
  };
  return (
    <>
      {!comment.isMine ? (
        <Text style={styles.helped} onPress={toggle} accessibilityRole="button" aria-pressed={on}>
          {on ? t('kindNorms.helpedOn') : t('kindNorms.helped')}
        </Text>
      ) : null}
      {comment.widelyAppreciated ? <Text style={styles.widely}>{t('kindNorms.widely')}</Text> : null}
    </>
  );
}

/** On your own comment, once someone sent a gentle note about it: write them a private sorry (Mend; a moderator reads it first). */
export function OfferSorry({ commentId }: { commentId: string }) {
  const { offerSorry } = useFeatures();
  const t = useT();
  const [offer, setOffer] = useState<{ available: boolean; mendId: string | null } | null>(null);
  useEffect(() => {
    if (!offerSorry) return;
    let live = true;
    api.sorryOffer(commentId).then(
      (r) => live && setOffer(r),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [offerSorry, commentId]);
  if (!offerSorry || !offer || (!offer.available && !offer.mendId)) return null;
  const open = () =>
    offer.mendId
      ? router.push(`/mend/${offer.mendId}`)
      : api.offerSorry(commentId).then(
          (r) => router.push(`/mend/${r.mendId}`),
          () => undefined,
        );
  return (
    <Text style={styles.helped} onPress={() => void open()} accessibilityRole="button" accessibilityHint={t('kindNorms.sorryHint')}>
      {offer.mendId ? t('kindNorms.sorryContinue') : t('kindNorms.sorry')}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  resting: { fontWeight: '600' },
  helped: { ...type.small, color: colors.primary, fontWeight: '600' },
  widely: { ...type.small, color: colors.textMuted },
});
