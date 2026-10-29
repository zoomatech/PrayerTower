// Who can reply (docs/CONVERSATION_HELPERS.md): the person who asked chooses everyone, only
// people who prayed, or no comments. Others who can't comment see a gentle note instead of the
// composer. Off unless Admin → Conversation helpers turns on "Who can reply".
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { api, type ReplyAudience, type ReplyChoiceState } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

const AUDIENCES: ReplyAudience[] = ['everyone', 'supporters', 'none'];

/** Wraps the comment composer: the author's choice above it, or a note in its place. */
export function ReplyChoiceGate({ postId, children }: { postId: string; children: ReactNode }) {
  const { replyChoice } = useFeatures();
  const t = useT();
  const [s, setS] = useState<ReplyChoiceState | null>(null);

  useEffect(() => {
    if (!replyChoice) return;
    let live = true;
    api.replyChoice(postId).then((r) => live && setS(r), () => undefined);
    return () => {
      live = false;
    };
  }, [replyChoice, postId]);

  if (!replyChoice || !s?.enabled) return <>{children}</>;

  const choose = (audience: ReplyAudience) =>
    api.setReplyChoice(postId, audience).then(
      (r) => {
        setS(r);
        announce(t(`replyChoice.${audience}`));
      },
      () => undefined,
    );

  return (
    <>
      {s.isMine ? (
        <View style={styles.card} role="radiogroup" aria-label={t('replyChoice.title')} testID="reply-choice">
          <Text style={type.small}>{t('replyChoice.title')}</Text>
          <View style={styles.row}>
            {AUDIENCES.map((a) => (
              <Chip key={a} radio label={t(`replyChoice.${a}`)} selected={s.audience === a} onPress={() => choose(a)} />
            ))}
          </View>
          {s.audience !== 'everyone' ? <Text style={type.small}>{t('replyChoice.updatesStill')}</Text> : null}
        </View>
      ) : null}
      {s.canComment ? (
        children
      ) : (
        <Text style={type.small} testID="reply-choice-note">
          {t(s.audience === 'none' ? 'replyChoice.noneNote' : 'replyChoice.supportersNote')}
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs, padding: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
