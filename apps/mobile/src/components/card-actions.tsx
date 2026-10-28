// What each card action does. Shared by every feed layout and the post screen,
// so the action row behaves the same everywhere.
import { ENCOURAGEMENT_MAX_CHARS, FREQUENCIES, FREQUENCY_LABELS, type Card, type CardAction, type Frequency } from '@prayer-tower/shared';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { colors, maxContentWidth, radius, space, type } from '@/lib/theme';

import { Button, Chip, ErrorText, Field } from './ui';

type ReportTarget = { type: 'post' | 'comment'; id: string };
type Sheet = {
  kind: 'praying' | 'commit' | 'encourage' | 'share' | 'gift' | 'report' | 'done';
  card: Card;
  message?: string;
  target?: ReportTarget;
} | null;

const REPORT_REASONS = ['Harmful or abusive', 'Spam or selling', 'Not a prayer or praise', 'Someone may be in danger', 'Something else'];

const INTEGRITY_TEXT = 'Tapping means you are bringing this request before the Lord right now.';

export function useCardActions(onChanged: () => void) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState<string | null>(null);

  const close = () => {
    setSheet(null);
    setError(null);
    setText('');
    setReason(null);
  };

  /** Report a request or one of its comments to the moderators. */
  const openReport = (card: Card, target: ReportTarget = { type: 'post', id: card.id }) => setSheet({ kind: 'report', card, target });

  const run = async (fn: () => Promise<unknown>, done: string) => {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSheet({ kind: 'done', card: sheet.card, message: done });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onAction = async (card: Card, action: CardAction) => {
    if (action === 'well_wishes') {
      await api.wellWishes(card.id).catch(() => undefined);
      onChanged();
      return;
    }
    const kind = ({ praying_now: 'praying', commit: 'commit', encouragement: 'encourage', share: 'share', gift_tokens: 'gift' } as const)[action];
    if (kind === 'commit' && card.myCommitment) {
      setSheet({ kind: 'done', card, message: `You are already praying ${FREQUENCY_LABELS[card.myCommitment.frequency].toLowerCase()} for this request.` });
      return;
    }
    if (kind === 'commit') setText(`I will pray for ${card.author.anonymous ? 'you' : card.author.displayName}.`);
    setSheet({ kind, card });
  };

  let body: ReactNode = null;
  if (sheet?.kind === 'praying') {
    body = (
      <>
        <Text style={type.heading}>Praying Now</Text>
        <Text style={type.body}>{INTEGRITY_TEXT}</Text>
        <Button label="I'm praying now" busy={busy} onPress={() => run(() => api.prayingNow(sheet.card.id), 'Thank you. They will know someone is praying for them right now.')} />
      </>
    );
  } else if (sheet?.kind === 'commit') {
    body = (
      <>
        <Text style={type.heading}>Commit to Regular Prayer</Text>
        <Field label="Your promise" value={text} onChangeText={setText} multiline maxLength={500} />
        <Text style={styles.label}>How often</Text>
        <View style={styles.row}>
          {FREQUENCIES.map((f) => (
            <Chip key={f} label={FREQUENCY_LABELS[f]} selected={frequency === f} onPress={() => setFrequency(f)} />
          ))}
        </View>
        <Field label="For how many days" value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={3} />
        <Button
          label="Make this commitment"
          busy={busy}
          disabled={!text.trim()}
          onPress={() =>
            run(
              () => api.commit(sheet.card.id, { frequency, vowText: text.trim(), durationDays: Number(days) || undefined }),
              'Your commitment is saved. We will remind you when it is time to pray.',
            )
          }
        />
      </>
    );
  } else if (sheet?.kind === 'encourage') {
    body = (
      <>
        <Text style={type.heading}>Send Encouragement</Text>
        <Field
          placeholder="A few words of hope"
          value={text}
          onChangeText={setText}
          maxLength={ENCOURAGEMENT_MAX_CHARS}
          multiline
        />
        <Text style={type.small}>
          {text.length}/{ENCOURAGEMENT_MAX_CHARS}
        </Text>
        <Button label="Send" busy={busy} disabled={!text.trim()} onPress={() => run(() => api.encourage(sheet.card.id, text.trim()), 'Your encouragement was sent.')} />
      </>
    );
  } else if (sheet?.kind === 'share') {
    body = (
      <>
        <Text style={type.heading}>Share to your feed</Text>
        <Field placeholder="Add a one-line intro (optional)" value={text} onChangeText={(t) => setText(t.replace(/\n/g, ' '))} maxLength={140} />
        <Button label="Share" busy={busy} onPress={() => run(() => api.share(sheet.card.id, text.trim() || undefined), 'Shared. Thank you for spreading the word.')} />
      </>
    );
  } else if (sheet?.kind === 'gift') {
    body = (
      <>
        <Text style={type.heading}>Gift Tokens</Text>
        <Text style={type.body}>Tokens help more people see this request. No one is ever hidden for lacking tokens.</Text>
        <Field label="How many tokens" value={text} onChangeText={setText} keyboardType="number-pad" maxLength={5} />
        <Button
          label="Give tokens"
          busy={busy}
          disabled={!(Number(text) > 0)}
          onPress={() => run(() => api.boost(sheet.card.id, Number(text), `${sheet.card.id}:${Date.now()}`), 'Thank you. More people will see this request.')}
        />
      </>
    );
  } else if (sheet?.kind === 'report' && sheet.target) {
    const target = sheet.target;
    body = (
      <>
        <Text style={type.heading}>Report this {target.type === 'post' ? 'request' : 'comment'}</Text>
        <Text style={type.body}>A moderator will look at it. The person is not told who reported it.</Text>
        <View style={styles.row}>
          {REPORT_REASONS.map((r) => (
            <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Field placeholder="Anything the moderator should know (optional)" value={text} onChangeText={setText} multiline maxLength={800} />
        <Button
          label="Send report"
          busy={busy}
          disabled={!reason}
          onPress={() =>
            run(
              () => api.report(target.type, target.id, [reason, text.trim()].filter(Boolean).join(': ')),
              'Thank you. A moderator will review this.',
            )
          }
        />
      </>
    );
  } else if (sheet?.kind === 'done') {
    body = (
      <>
        <Text style={type.body}>{sheet.message}</Text>
        <Button label="Close" variant="secondary" onPress={close} />
      </>
    );
  }

  const sheets = (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          {body}
          <ErrorText error={error} />
          {sheet?.kind !== 'done' ? <Button label="Cancel" variant="ghost" onPress={close} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );

  return { onAction, openReport, sheets };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,12,30,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { ...type.small, fontWeight: '600', color: colors.text },
});
