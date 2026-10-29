// Comment kindness under each comment (docs/CONVERSATION_HELPERS.md): the asker's heart
// ("Loved by the person who asked") and a private "Thank" for the commenter. Neither
// shows a number. Quiet counts: each member can hide prayer numbers (Me), and an author
// can hide them on their own posts for others.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, space, type } from '@/lib/theme';

export interface CommentKindnessState {
  hearts: Set<string>;
  thanked: Set<string>;
  toggleHeart: (commentId: string) => void;
  thank: (commentId: string) => void;
}

/** Which comments on a post the asker loved and the viewer thanked; null while off. */
export function useCommentKindness(postId: string): CommentKindnessState | null {
  const f = useFeatures();
  const t = useT();
  const on = f.authorHearts || f.commentThanks;
  const [hearts, setHearts] = useState<Set<string>>(new Set());
  const [thanked, setThanked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!on) return;
    let live = true;
    api.commentKindness(postId).then(
      (r) => {
        if (!live) return;
        setHearts(new Set(r.hearts));
        setThanked(new Set(r.thanked));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [on, postId]);
  const toggleHeart = useCallback(
    (id: string) => {
      const next = !hearts.has(id);
      api.heartComment(id, next).then(
        () => {
          setHearts((h) => {
            const s = new Set(h);
            if (next) s.add(id);
            else s.delete(id);
            return s;
          });
          announce(next ? t('commentKindness.hearted') : t('commentKindness.unhearted'));
        },
        () => undefined,
      );
    },
    [hearts, t],
  );
  const thank = useCallback(
    (id: string) => {
      api.thankComment(id).then(
        () => {
          setThanked((s) => new Set(s).add(id));
          announce(t('commentKindness.thankedNote'));
        },
        () => setThanked((s) => new Set(s).add(id)),
      );
    },
    [t],
  );
  return on ? { hearts, thanked, toggleHeart, thank } : null;
}

/** The heart line and buttons under one comment. */
export function CommentKindness({ k, commentId, isAsker, isMine }: { k: CommentKindnessState | null; commentId: string; isAsker: boolean; isMine: boolean }) {
  const f = useFeatures();
  const t = useT();
  if (!k) return null;
  const loved = f.authorHearts && k.hearts.has(commentId);
  const canHeart = f.authorHearts && isAsker && !isMine;
  const canThank = f.commentThanks && !isMine;
  if (!loved && !canHeart && !canThank) return null;
  return (
    <View style={styles.row}>
      {loved && !canHeart ? <Text style={styles.loved}>❤️ {t('commentKindness.loved')}</Text> : null}
      {canHeart ? (
        <Text style={styles.action} accessibilityRole="button" accessibilityState={{ selected: loved }} onPress={() => k.toggleHeart(commentId)}>
          {loved ? `❤️ ${t('commentKindness.youLoved')}` : `♡ ${t('commentKindness.love')}`}
        </Text>
      ) : null}
      {canThank ? (
        k.thanked.has(commentId) ? (
          <Text style={styles.done}>✓ {t('commentKindness.thankedShort')}</Text>
        ) : (
          <Text style={styles.action} accessibilityRole="button" accessibilityHint={t('commentKindness.thankHint')} onPress={() => k.thank(commentId)}>
            {t('commentKindness.thank')}
          </Text>
        )
      ) : null}
    </View>
  );
}

// Quiet counts ------------------------------------------------------------------------

let quietOnce: Promise<{ hideSeen: boolean; hideMine: boolean }> | null = null;
/** The member's own choice to hide prayer numbers on posts they see. */
export function useQuietSeen() {
  const { quietCounts } = useFeatures();
  const [hide, setHide] = useState(false);
  useEffect(() => {
    if (!quietCounts) return;
    let live = true;
    quietOnce ??= api.quietCounts().catch(() => {
      quietOnce = null;
      return { hideSeen: false, hideMine: false };
    });
    quietOnce.then((p) => live && setHide(p.hideSeen));
    return () => {
      live = false;
    };
  }, [quietCounts]);
  return quietCounts && hide;
}

export function resetQuietCounts() {
  quietOnce = null;
}

/** Me: hide prayer numbers on posts I see, or on my posts for others. */
export function QuietCountsCard() {
  const { quietCounts } = useFeatures();
  const t = useT();
  const [p, setP] = useState<{ hideSeen: boolean; hideMine: boolean } | null>(null);
  useEffect(() => {
    if (!quietCounts) return;
    api.quietCounts().then(setP, () => undefined);
  }, [quietCounts]);
  if (!quietCounts || !p) return null;
  const save = (patch: Partial<{ hideSeen: boolean; hideMine: boolean }>) =>
    api.setQuietCounts(patch).then((r) => {
      resetQuietCounts();
      setP(r);
    }, () => undefined);
  return (
    <View style={styles.card} testID="quiet-counts">
      <Text style={type.heading} accessibilityRole="header">
        {t('quietCounts.title')}
      </Text>
      <Toggle label={t('quietCounts.seen')} hint={t('quietCounts.seenHint')} value={p.hideSeen} onChange={(v) => save({ hideSeen: v })} />
      <Toggle label={t('quietCounts.mine')} hint={t('quietCounts.mineHint')} value={p.hideMine} onChange={(v) => save({ hideMine: v })} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, alignItems: 'center' },
  loved: { ...type.small, color: colors.primary },
  action: { ...type.small, color: colors.primary, minHeight: 44, paddingVertical: space.sm },
  done: { ...type.small },
  card: { gap: space.sm },
});
