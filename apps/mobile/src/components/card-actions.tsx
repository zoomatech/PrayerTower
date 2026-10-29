// What each card action does. Shared by every feed layout and the post screen,
// so the action row behaves the same everywhere.
import { ACTION_LABELS, ENCOURAGEMENT_MAX_CHARS, FREQUENCIES, FREQUENCY_LABELS, type Card, type CardAction, type Frequency } from '@prayer-tower/shared';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, type TokenPool } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { parseLocal, REPEAT_OPTIONS, WHEN_OPTIONS } from '@/lib/schedule';
import { colors, maxContentWidth, radius, space, type } from '@/lib/theme';

import { KindCloud } from './kind-cloud';
import { OutsideShareButton } from './outside-share';
import { Button, Chip, ErrorText, Field, RulesWarning } from './ui';

type ReportTarget = { type: 'post' | 'comment'; id: string };
type Sheet = {
  kind: 'praying' | 'commit' | 'encourage' | 'share' | 'gift' | 'report' | 'done';
  card: Card;
  message?: string;
  target?: ReportTarget;
} | null;

// Sent to moderators in English; shown in the member's language.
const REPORT_REASONS = ['Harmful or abusive', 'Spam or selling', 'Not a prayer or praise', 'Someone may be in danger', 'Something else'];

export function useCardActions(onChanged: () => void) {
  const { kindCloud } = useFeatures();
  const { t, label } = useLocale();
  const freq = (f: Frequency) => label('frequency', f, FREQUENCY_LABELS[f]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState<string | null>(null);
  const [people, setPeople] = useState<{ id: string; display_name: string }[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [warnedFor, setWarnedFor] = useState<string | null>(null);
  const [pools, setPools] = useState<TokenPool[]>([]);
  const [when, setWhen] = useState('now');
  const [customWhen, setCustomWhen] = useState('');
  const [repeatWeeks, setRepeatWeeks] = useState(1);

  const close = () => {
    setSheet(null);
    setError(null);
    setText('');
    setReason(null);
    setPicked([]);
    setWarnedFor(null);
    setWhen('now');
    setCustomWhen('');
    setRepeatWeeks(1);
  };

  /** Report a request or one of its comments to the moderators. */
  const openReport = (card: Card, target: ReportTarget = { type: 'post', id: card.id }) => setSheet({ kind: 'report', card, target });

  const run = async (fn: () => Promise<unknown>, done: string) => {
    if (!sheet) return;
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      const queued = !!result && typeof result === 'object' && 'queued' in result;
      setSheet({ kind: 'done', card: sheet.card, message: queued ? t('actions.queued') : done });
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
      setSheet({ kind: 'done', card, message: t('actions.alreadyCommitted', { frequency: freq(card.myCommitment.frequency).toLowerCase() }) });
      return;
    }
    if (kind === 'share') {
      setPeople(null);
      api.connections().then((r) => setPeople(r.people), () => setPeople([]));
    }
    if (kind === 'gift') {
      setPools([]);
      api.tokenPools(card.id).then((r) => setPools(r.pools.filter((p) => !p.blockedReason).sort((x, y) => y.balance - x.balance).slice(0, 3)), () => undefined);
    }
    if (kind === 'commit') setText(card.author.anonymous ? t('actions.promiseYou') : t('actions.promiseName', { name: card.author.displayName }));
    setSheet({ kind, card });
  };

  let body: ReactNode = null;
  if (sheet?.kind === 'praying') {
    body = (
      <>
        <Text style={type.heading}>{label('action', 'praying_now', 'Praying Now')}</Text>
        <Text style={type.body}>{t('actions.integrity')}</Text>
        <Button label={t('actions.prayingNow')} busy={busy} onPress={() => run(() => api.prayingNow(sheet.card.id), t('actions.prayingDone'))} />
      </>
    );
  } else if (sheet?.kind === 'commit') {
    body = (
      <>
        <Text style={type.heading}>{t('actions.commitTitle')}</Text>
        <Field label={t('actions.promise')} value={text} onChangeText={setText} multiline maxLength={500} />
        <Text style={styles.label}>{t('actions.howOften')}</Text>
        <View style={styles.row}>
          {FREQUENCIES.map((f) => (
            <Chip radio key={f} label={freq(f)} selected={frequency === f} onPress={() => setFrequency(f)} />
          ))}
        </View>
        <Field label={t('actions.days')} value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={3} />
        <Button
          label={t('actions.commit')}
          busy={busy}
          disabled={!text.trim()}
          onPress={() =>
            run(
              () => api.commit(sheet.card.id, { frequency, vowText: text.trim(), durationDays: Number(days) || undefined }),
              t('actions.commitDone'),
            )
          }
        />
      </>
    );
  } else if (sheet?.kind === 'encourage') {
    body = (
      <>
        <Text style={type.heading}>{t('actions.encourageTitle')}</Text>
        <Field
          placeholder={t('actions.encouragePlaceholder')}
          value={text}
          onChangeText={setText}
          maxLength={ENCOURAGEMENT_MAX_CHARS}
          multiline
        />
        <Text style={type.small}>
          {text.length}/{ENCOURAGEMENT_MAX_CHARS}
        </Text>
        <KindCloud text={text} />
        {warnedFor === text ? (
          <RulesWarning busy={busy} onPostAnyway={() => run(() => api.encourage(sheet.card.id, text.trim()), t('actions.encourageDone'))} />
        ) : null}
        <Button
          label={t('actions.send')}
          busy={busy}
          disabled={!text.trim()}
          onPress={async () => {
            if (!kindCloud && (await api.precheck(text.trim())).warn) return setWarnedFor(text);
            run(() => api.encourage(sheet.card.id, text.trim()), t('actions.encourageDone'));
          }}
        />
      </>
    );
  } else if (sheet?.kind === 'share') {
    body = (
      <>
        <Text style={type.heading}>{t('actions.shareTitle')}</Text>
        <Field placeholder={t('actions.shareIntro')} value={text} onChangeText={(v) => setText(v.replace(/\n/g, ' '))} maxLength={140} />
        <Button label={label('action', 'share', 'Share')} busy={busy} onPress={() => run(() => api.share(sheet.card.id, text.trim() || undefined), t('actions.shareDone'))} />
        <Text style={type.heading}>{t('actions.askTitle')}</Text>
        {people === null ? <Text style={type.small}>{t('common.loading')}</Text> : null}
        {people?.length === 0 ? <Text style={type.small}>{t('actions.followToAsk')}</Text> : null}
        {people?.length ? (
          <>
            <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={styles.chips}>
              {people.map((p) => (
                <Chip
                  key={p.id}
                  label={p.display_name}
                  selected={picked.includes(p.id)}
                  onPress={() => setPicked((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id].slice(0, 20)))}
                />
              ))}
            </ScrollView>
            <Button
              variant="secondary"
              label={picked.length ? t('actions.askCount', { count: picked.length }) : t('actions.choosePeople')}
              busy={busy}
              disabled={!picked.length}
              onPress={() =>
                run(async () => {
                  const r = await api.askToPray(sheet.card.id, picked, text.trim());
                  if (r.sent === 0) throw new Error(t('actions.alreadyAsked'));
                }, t('actions.askDone'))
              }
            />
          </>
        ) : null}
        <OutsideShareButton card={sheet.card} />
      </>
    );
  } else if (sheet?.kind === 'gift') {
    body = (
      <>
        <Text style={type.heading}>{label('action', 'gift_tokens', 'Gift Tokens')}</Text>
        <Text style={type.body}>{t('actions.giftNote')}</Text>
        <Field label={t('actions.howMany')} value={text} onChangeText={setText} keyboardType="number-pad" maxLength={5} />
        <Text style={styles.label}>{t('actions.when')}</Text>
        <View style={styles.chips}>
          <Chip radio label={t('actions.now')} selected={when === 'now'} onPress={() => setWhen('now')} />
          {WHEN_OPTIONS.map((o) => (
            <Chip radio key={o.key} label={t(`actions.whenOptions.${o.key}`, { defaultValue: o.label })} selected={when === o.key} onPress={() => setWhen(o.key)} />
          ))}
          <Chip radio label={t('actions.pickTime')} selected={when === 'custom'} onPress={() => setWhen('custom')} />
        </View>
        {when === 'custom' ? (
          <Field placeholder={t('actions.timeFormat')} value={customWhen} onChangeText={setCustomWhen} maxLength={16} />
        ) : null}
        {when !== 'now' ? (
          <View style={styles.chips}>
            {REPEAT_OPTIONS.map((o) => (
              <Chip radio key={o.weeks} label={o.weeks === 1 ? t('actions.once') : t('actions.weeklyFor', { count: o.weeks })} selected={repeatWeeks === o.weeks} onPress={() => setRepeatWeeks(o.weeks)} />
            ))}
          </View>
        ) : null}
        {when === 'now' ? (
          <Button
            label={t('actions.give')}
            busy={busy}
            disabled={!(Number(text) > 0)}
            onPress={() => run(() => api.boost(sheet.card.id, Number(text), `${sheet.card.id}:${Date.now()}`), t('actions.giveDone'))}
          />
        ) : (
          <Button
            label={t('actions.schedule')}
            busy={busy}
            disabled={!(Number(text) > 0) || (when === 'custom' && !parseLocal(customWhen))}
            onPress={() => {
              const at = when === 'custom' ? parseLocal(customWhen)! : WHEN_OPTIONS.find((o) => o.key === when)!.at();
              const whenText = at.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
              run(
                () => api.scheduleSpend(sheet.card.id, { amount: Number(text), runAt: at.toISOString(), repeatWeeks }),
                repeatWeeks > 1 ? t('actions.scheduledRepeat', { count: Number(text), when: whenText, weeks: repeatWeeks }) : t('actions.scheduledOnce', { count: Number(text), when: whenText }),
              );
            }}
          />
        )}
        {pools.length > 0 ? <Text style={styles.label}>{t('actions.orPool')}</Text> : null}
        {pools.map((p) => (
          <Button
            key={p.id}
            variant="secondary"
            label={t('actions.poolGive', { name: p.name, count: p.drawAmount })}
            busy={busy}
            onPress={() => run(() => api.drawFromPool(p.id, sheet.card.id), t('actions.poolDone', { name: p.name, count: p.drawAmount }))}
          />
        ))}
      </>
    );
  } else if (sheet?.kind === 'report' && sheet.target) {
    const target = sheet.target;
    body = (
      <>
        <Text style={type.heading}>{target.type === 'post' ? t('actions.reportPost') : t('actions.reportComment')}</Text>
        <Text style={type.body}>{t('actions.reportNote')}</Text>
        <View style={styles.row}>
          {REPORT_REASONS.map((r) => (
            <Chip radio key={r} label={t(`actions.reasons.${REPORT_REASONS.indexOf(r)}`)} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Field placeholder={t('actions.reportDetails')} value={text} onChangeText={setText} multiline maxLength={800} />
        <Button
          label={t('actions.sendReport')}
          busy={busy}
          disabled={!reason}
          onPress={() =>
            run(
              () => api.report(target.type, target.id, [reason, text.trim()].filter(Boolean).join(': ')),
              t('actions.reportDone'),
            )
          }
        />
      </>
    );
  } else if (sheet?.kind === 'done') {
    body = (
      <>
        <Text style={type.body}>{sheet.message}</Text>
        <Button label={t('common.close')} variant="secondary" onPress={close} />
      </>
    );
  }

  // Screen readers announce the open sheet by this name.
  const sheetTitle = sheet
    ? {
        praying: label('action', 'praying_now', ACTION_LABELS.praying_now),
        commit: t('actions.commitTitle'),
        encourage: label('action', 'encouragement', ACTION_LABELS.encouragement),
        share: label('action', 'share', ACTION_LABELS.share),
        gift: label('action', 'gift_tokens', ACTION_LABELS.gift_tokens),
        report: 'Report',
        done: 'Done',
      }[sheet.kind]
    : undefined;

  const sheets = (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessible={false}>
        <Pressable style={styles.sheet} onPress={() => undefined} accessible={false} accessibilityViewIsModal role="dialog" aria-label={sheetTitle}>
          {body}
          <ErrorText error={error} />
          {sheet?.kind !== 'done' ? <Button label={t('common.cancel')} variant="ghost" onPress={close} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );

  // A stable handler that always runs the latest onAction, so memoized cards don't re-render.
  const latest = useRef(onAction);
  latest.current = onAction;
  const stableOnAction = useCallback((card: Card, action: CardAction) => latest.current(card, action), []);

  return { onAction: stableOnAction, openReport, sheets };
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  label: { ...type.small, fontWeight: '600', color: colors.text },
});
