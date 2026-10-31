// Prayer resolution (Steve, 2026-10-31; server modules/resolution): on the author's own request,
// "Has this prayer been answered?". Yes opens a two-answer survey; "Not yet" offers to repost or
// reword the prayer, and a free broadcast token when Admin offers one. Whether the prayer went
// out by radio is looked up on the server, never asked here.
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { api, type ResolutionOutcome, type ResolutionStatus } from '@/lib/api';
import { errorText } from '@/lib/error-report';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const OUTCOMES: { outcome: ResolutionOutcome; key: string }[] = [
  { outcome: 'hoped', key: 'resolution.hoped' },
  { outcome: 'his_will', key: 'resolution.hisWill' },
];

export function ResolutionCard({ postId, isMine, onChanged }: { postId: string; isMine: boolean; onChanged?: () => void }) {
  const { prayerResolution } = useFeatures();
  const t = useT();
  const router = useRouter();
  const [s, setS] = useState<ResolutionStatus | null>(null);
  const [step, setStep] = useState<'ask' | 'survey' | 'reword'>('ask');
  const [words, setWords] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [reposted, setReposted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!prayerResolution || !isMine) return;
    let live = true;
    api
      .resolution(postId)
      .then((r) => live && setS(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [prayerResolution, isMine, postId]);

  if (!prayerResolution || !isMine || !s) return null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const answer = (outcome: ResolutionOutcome | null) =>
    run(async () => {
      const next = await api.answerResolution(postId, outcome ? { answered: true, outcome } : { answered: false });
      setS(next);
      setStep('ask');
      setNote(outcome ? t('resolution.answeredThanks') : null);
      onChanged?.();
    });

  const repost = (body?: string) =>
    run(async () => {
      const r = await api.repostResolution(postId, body);
      setReposted(r.post.id);
      setS({ ...s, canRepost: false, repostedPostId: r.post.id });
      setStep('ask');
    });

  const takeToken = () =>
    run(async () => {
      await api.claimResolutionToken(postId);
      setS({ ...s, freeTokens: 0, tokenClaimed: true });
      setNote(t('resolution.tokenTaken'));
    });

  const notYet = s.answered === false && !s.pending;
  const showRepost = notYet && s.canRepost;
  const showToken = notYet && s.freeTokens > 0;
  if (!s.pending && !showRepost && !showToken && !note && !reposted) return null;

  return (
    <View style={styles.card} testID="resolution-card">
      {s.pending ? (
        <>
          <Text style={type.heading}>{t(step === 'survey' ? 'resolution.surveyTitle' : 'resolution.title')}</Text>
          {step === 'survey' ? (
            <View style={styles.column}>
              {OUTCOMES.map((o) => (
                <Button key={o.outcome} small variant="secondary" label={t(o.key)} busy={busy} testID={`resolution-${o.outcome}`} onPress={() => answer(o.outcome)} />
              ))}
              <Button small variant="ghost" label={t('resolution.back')} onPress={() => setStep('ask')} />
            </View>
          ) : (
            <View style={styles.row}>
              <Button small variant="secondary" label={t('resolution.yes')} testID="resolution-yes" onPress={() => setStep('survey')} />
              <Button small variant="secondary" label={t('resolution.notYet')} busy={busy} testID="resolution-not-yet" onPress={() => answer(null)} />
            </View>
          )}
        </>
      ) : null}
      {showRepost ? (
        <>
          <Text style={type.body}>{t('resolution.notYetIntro')}</Text>
          {step === 'reword' ? (
            <>
              <Field label={t('resolution.rewordLabel')} multiline maxLength={10_000} value={words} onChangeText={setWords} />
              <View style={styles.row}>
                <Button small label={t('resolution.rewordSend')} busy={busy} disabled={!words.trim()} testID="resolution-reword-send" onPress={() => repost(words.trim())} />
                <Button small variant="ghost" label={t('resolution.back')} onPress={() => setStep('ask')} />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Button small variant="secondary" label={t('resolution.repost')} busy={busy} testID="resolution-repost" onPress={() => repost()} />
              <Button small variant="secondary" label={t('resolution.reword')} testID="resolution-reword" onPress={() => setStep('reword')} />
            </View>
          )}
        </>
      ) : null}
      {showToken ? (
        <>
          <Text style={type.body}>{t('resolution.tokenOffer', { count: s.freeTokens })}</Text>
          <Button small label={t('resolution.tokenTake')} busy={busy} testID="resolution-token" onPress={takeToken} />
        </>
      ) : null}
      {reposted ? (
        <View style={styles.row}>
          <Text style={[type.small, styles.done]}>{t('resolution.reposted')}</Text>
          <Button small variant="ghost" label={t('resolution.open')} onPress={() => router.push(`/post/${reposted}`)} />
        </View>
      ) : null}
      {note ? <Text style={[type.small, styles.done]}>{note}</Text> : null}
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  column: { gap: space.sm },
  done: { color: colors.primary },
});
