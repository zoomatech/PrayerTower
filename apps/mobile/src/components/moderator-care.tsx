// Moderator care (docs/HARMFUL_PRAYERS.md, "For moderators"), off by default: hard items
// blurred until tapped, a break offered after a stretch of reviewing, and handing an item
// to another moderator. A break is an offer the moderator can decline, never a lock.
import type { ModerationItem } from '@prayer-tower/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { api, type ModeratorCare } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export function useModeratorCare() {
  const [care, setCare] = useState<ModeratorCare | null>(null);
  const [started, setStarted] = useState(() => Date.now());
  const [hardRead, setHardRead] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [breakUntil, setBreakUntil] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.moderatorCare().then(setCare, () => setCare(null));
    }, []),
  );
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const s = care?.settings;
  const on = !!s?.enabled;
  const minutes = (now - started) / 60_000;
  const breakDue =
    on && !breakUntil && ((s!.break_after_minutes > 0 && minutes >= s!.break_after_minutes) || (s!.break_after_hard_items > 0 && hardRead >= s!.break_after_hard_items));
  const keepGoing = () => {
    const at = Date.now();
    setStarted(at);
    setNow(at);
    setHardRead(0);
  };
  const takeBreak = () => {
    setBreakUntil(Date.now() + (s?.break_minutes ?? 5) * 60_000);
    keepGoing();
  };
  const onBreak = breakUntil !== null && now < breakUntil;
  return {
    on,
    blur: on && !!s?.blur_hard,
    /** Held items show "Restore": logged as a restore, and the author is told. */
    restore: !!s?.restore_enabled,
    colleagues: care?.colleagues ?? [],
    breakDue,
    onBreak,
    breakMinutesLeft: onBreak ? Math.ceil((breakUntil! - now) / 60_000) : 0,
    endBreak: () => setBreakUntil(null),
    takeBreak,
    keepGoing,
    countHardRead: () => setHardRead((n) => n + 1),
  };
}
export type Care = ReturnType<typeof useModeratorCare>;

/** The item's text, blurred behind a tap when it is hard and blurring is on. */
export function HardText({ item, care }: { item: ModerationItem; care: Care }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const text = item.content ?? t('moderation.gone');
  if (!care.blur || !item.hard || shown) return <Text style={type.body}>{text}</Text>;
  return (
    <Pressable
      role="button"
      accessibilityLabel={t('modCare.tapToRead')}
      onPress={() => {
        setShown(true);
        care.countHardRead();
      }}
      style={styles.veil}>
      <Text style={type.body}>{t('modCare.hidden')}</Text>
      <Text style={type.small}>{t('modCare.tapToRead')}</Text>
    </Pressable>
  );
}

/** The break offer, or the break itself with time left. */
export function BreakCard({ care }: { care: Care }) {
  const t = useT();
  if (care.onBreak) {
    return (
      <View style={styles.card}>
        <Text style={type.heading}>{t('modCare.onBreak', { minutes: care.breakMinutesLeft })}</Text>
        <Text style={type.small}>{t('modCare.onBreakHint')}</Text>
        <Button small variant="secondary" label={t('modCare.endBreak')} onPress={care.endBreak} />
      </View>
    );
  }
  if (!care.breakDue) return null;
  return (
    <View style={styles.card}>
      <Text style={type.heading}>{t('modCare.breakTitle')}</Text>
      <Text style={type.small}>{t('modCare.breakHint')}</Text>
      <View style={styles.row}>
        <Button small label={t('modCare.takeBreak')} onPress={care.takeBreak} />
        <Button small variant="ghost" label={t('modCare.keepGoing')} onPress={care.keepGoing} />
      </View>
    </View>
  );
}

/** Who passed this item on, the member's own explanation, and passing it on again. */
export function HandoffRow({ item, care, onDone, onError }: { item: ModerationItem; care: Care; onDone: () => void; onError: (m: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const pass = (toUserId?: string) =>
    api.handoff(item.id, toUserId, note.trim() || undefined).then(onDone, (e) => onError((e as Error).message));
  return (
    <>
      {item.handoff_from_name ? (
        <Text style={type.small}>{t('modCare.passedBy', { name: item.handoff_from_name, note: item.handoff_note ?? '' })}</Text>
      ) : null}
      {item.author_note ? <Text style={styles.note}>{t('modCare.authorNote', { note: item.author_note })}</Text> : null}
      {care.on ? (
        open ? (
          <View style={{ gap: space.sm }}>
            <Field placeholder={t('modCare.notePlaceholder')} value={note} onChangeText={setNote} maxLength={500} />
            <View style={styles.row}>
              {care.colleagues.map((c) => (
                <Button key={c.id} small variant="secondary" label={t('modCare.passTo', { name: c.display_name })} onPress={() => pass(c.id)} />
              ))}
              <Button small variant="secondary" label={t('modCare.passAnyone')} onPress={() => pass()} />
              <Button small variant="ghost" label={t('common.cancel')} onPress={() => setOpen(false)} />
            </View>
          </View>
        ) : (
          <Button small variant="ghost" label={t('modCare.handOff')} onPress={() => setOpen(true)} />
        )
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  veil: { backgroundColor: colors.border, borderRadius: radius.md, padding: space.md, gap: space.xs },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: { ...type.body, fontStyle: 'italic' },
});
