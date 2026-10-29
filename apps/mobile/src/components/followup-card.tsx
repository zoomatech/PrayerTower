// "Share how it's going?" (docs/GROWTH_PRACTICES.md): once, some days after a
// request someone prayed for, its author may tell the pray-ers how it's going.
// "Prefer not to say" is always there and closes it quietly. Shown only to the
// author, only while Admin → Growth practices has follow-ups on.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { api, type FollowupAnswer } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const CHOICES: { answer: FollowupAnswer; key: string }[] = [
  { answer: 'grateful', key: 'practices.followupGrateful' },
  { answer: 'still', key: 'practices.followupStill' },
  { answer: 'changed', key: 'practices.followupChanged' },
];

export function FollowupCard({ postId, isMine, onAnswered }: { postId: string; isMine: boolean; onAnswered?: (answer: FollowupAnswer) => void }) {
  const { followupNudge } = useFeatures();
  const t = useT();
  const [pending, setPending] = useState(false);
  const [choice, setChoice] = useState<FollowupAnswer | null>(null);
  const [body, setBody] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!followupNudge || !isMine) return;
    let live = true;
    api
      .followup(postId)
      .then((r) => live && setPending(r.pending))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [followupNudge, isMine, postId]);

  if (!followupNudge || !isMine) return null;
  if (done) return <Text style={[type.small, styles.done]}>{done}</Text>;
  if (!pending) return null;

  const send = async (answer: FollowupAnswer) => {
    setBusy(true);
    setError(null);
    try {
      await api.answerFollowup(postId, answer, body.trim() || undefined);
      setDone(answer === 'private' ? t('practices.followupQuiet') : t('practices.followupThanks'));
      onAnswered?.(answer);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="followup-card">
      <Text style={type.heading}>{t('practices.followupTitle')}</Text>
      <Text style={type.small}>{t('practices.followupIntro')}</Text>
      {choice ? (
        <>
          <Field
            label={t(CHOICES.find((c) => c.answer === choice)!.key)}
            placeholder={t('practices.followupPlaceholder')}
            multiline
            maxLength={2000}
            value={body}
            onChangeText={setBody}
          />
          <View style={styles.row}>
            <Button small label={t('practices.followupSend')} busy={busy} onPress={() => send(choice)} />
            <Button small variant="ghost" label={t('practices.followupBack')} onPress={() => setChoice(null)} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          {CHOICES.map((c) => (
            <Button key={c.answer} small variant="secondary" label={t(c.key)} testID={`followup-${c.answer}`} onPress={() => setChoice(c.answer)} />
          ))}
          <Button small variant="ghost" label={t('practices.followupPrivate')} busy={busy} testID="followup-private" onPress={() => send('private')} />
        </View>
      )}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  done: { color: colors.primary },
});
