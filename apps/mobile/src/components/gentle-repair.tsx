// Gentle repair (docs/GENTLE_REPAIR.md): the welcome card above a first comment,
// "This hurt me" under someone else's comment (an unsigned "ask kindly" note, or
// an invitation to a sorry), and the moderators' queue of sorries to read.
// Each part shows only while its Admin → Growth practices switch is on.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field } from '@/components/ui';
import { api, type KindAskReason, type Mend } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

/** Above the comment box until the member's first comment, or until they tap "Got it". */
export function WelcomeCard() {
  const { welcomeCard } = useFeatures();
  const t = useT();
  const [card, setCard] = useState<{ show: boolean; text: string | null } | null>(null);
  useEffect(() => {
    if (!welcomeCard) return;
    api.welcomeCard().then(setCard).catch(() => undefined);
  }, [welcomeCard]);
  if (!welcomeCard || !card?.show) return null;
  return (
    <View style={styles.card} testID="welcome-card">
      <Text style={type.heading}>{t('repair.welcomeTitle')}</Text>
      <Text style={type.body}>{card.text ?? t('repair.welcomeDefault')}</Text>
      <Button small variant="secondary" label={t('repair.welcomeDismiss')} onPress={() => api.dismissWelcome().then(setCard).catch(() => setCard(null))} />
    </View>
  );
}

const REASONS: { reason: KindAskReason; key: string }[] = [
  { reason: 'dismissive', key: 'repair.reasonDismissive' },
  { reason: 'grief', key: 'repair.reasonGrief' },
  { reason: 'unkind', key: 'repair.reasonUnkind' },
  { reason: 'other', key: 'repair.reasonOther' },
];

/** "This hurt me" under someone else's comment. Reporting to a person stays one tap away. */
export function HurtNote({ commentId, onReport }: { commentId: string; onReport: () => void }) {
  const { askKindly, mend } = useFeatures();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<KindAskReason>('unkind');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!askKindly && !mend) return null;
  if (done) return <Text style={[type.small, styles.done]}>{done}</Text>;
  if (!open)
    return (
      <Text style={styles.link} accessibilityRole="button" onPress={() => setOpen(true)} testID={`hurt-${commentId}`}>
        {t('repair.hurt')}
      </Text>
    );
  const run = (fn: () => Promise<unknown>, note: string) =>
    fn().then(
      () => setDone(note),
      (e) => setError(errorText(e)),
    );
  return (
    <View style={styles.card} testID="hurt-note">
      <Text style={type.small}>{t('repair.hurtIntro')}</Text>
      {askKindly ? (
        <>
          <View style={styles.row} role="radiogroup">
            {REASONS.map((r) => (
              <Chip key={r.reason} radio label={t(r.key)} selected={reason === r.reason} onPress={() => setReason(r.reason)} />
            ))}
          </View>
          <Button small label={t('repair.askKindly')} onPress={() => run(() => api.askKindly(commentId, reason), t('repair.askSent'))} />
          <Text style={type.small}>{t('repair.askKindlyHint')}</Text>
        </>
      ) : null}
      {mend ? (
        <>
          <Button small variant="secondary" label={t('repair.inviteSorry')} onPress={() => run(() => api.inviteMend(commentId), t('repair.invited'))} />
          <Text style={type.small}>{t('repair.inviteSorryHint')}</Text>
        </>
      ) : null}
      <View style={styles.row}>
        <Button small variant="ghost" label={t('repair.reportInstead')} onPress={onReport} />
        <Button small variant="ghost" label={t('repair.close')} onPress={() => setOpen(false)} />
      </View>
      <ErrorText error={error} />
    </View>
  );
}

/** Moderation → Sorries to read: deliver, or return once with a kind note. */
export function MendQueue() {
  const { mend } = useFeatures();
  const t = useT();
  const [mends, setMends] = useState<Mend[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.mendQueue().then((r) => setMends(r.mends), (e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (mend) load();
  }, [mend, load]);
  if (!mend) return null;
  const review = (m: Mend, approve: boolean) => api.reviewMend(m.id, approve, notes[m.id]?.trim() || undefined).then(load, (e) => setError(errorText(e)));
  return (
    <View style={styles.queue} testID="mend-queue">
      <Text style={type.heading}>{t('repair.queueTitle')}</Text>
      <Text style={type.small}>{t('repair.queueIntro')}</Text>
      {!mends.length ? <Text style={type.small}>{t('repair.queueEmpty')}</Text> : null}
      {mends.map((m) => (
        <View key={m.id} style={styles.card}>
          <Text style={type.small} accessibilityRole="link" onPress={() => router.push(`/post/${m.comment.postId}`)}>
            {m.author?.displayName}: “{m.comment.body}”
          </Text>
          {m.sorry ? (
            <>
              <Text style={type.body}>{m.sorry.whatIDid}</Text>
              <Text style={type.body}>{m.sorry.onMe}</Text>
              <Text style={type.body}>{m.sorry.nextTime}</Text>
            </>
          ) : null}
          <Field placeholder={t('repair.notePlaceholder')} value={notes[m.id] ?? ''} onChangeText={(v) => setNotes((n) => ({ ...n, [m.id]: v }))} maxLength={600} />
          <View style={styles.row}>
            <Button small label={t('repair.deliver')} onPress={() => review(m, true)} />
            <Button small variant="secondary" label={t('repair.returnIt')} onPress={() => review(m, false)} />
          </View>
        </View>
      ))}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  queue: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  link: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  done: { color: colors.primary },
});
