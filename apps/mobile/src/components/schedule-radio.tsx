// Scheduled radio sends (docs/STATION_OPERATOR_GUIDE.md): send a request by radio,
// or amplified, at a set time, once or weekly ("the rest at the start of the
// game"). The radio prayer's own price and rules apply when it runs. Off with
// the admin's switch.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { parseLocal, REPEAT_OPTIONS, WHEN_OPTIONS } from '@/lib/schedule';
import { space, type } from '@/lib/theme';

export function ScheduleRadio({ postId, canAmplify }: { postId: string; canAmplify: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(WHEN_OPTIONS[0]!.key);
  const [custom, setCustom] = useState('');
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [amplify, setAmplify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button variant="secondary" label={t('scheduleRadio.open')} onPress={() => setOpen(true)} />;
  if (done) return <Text style={type.small}>{done}</Text>;
  const at = when === 'custom' ? parseLocal(custom) : WHEN_OPTIONS.find((o) => o.key === when)!.at();
  const submit = async () => {
    if (!at) return;
    setBusy(true);
    setError(null);
    try {
      await api.scheduleSpend(postId, { amount: 1, runAt: at.toISOString(), repeatWeeks, action: amplify ? 'amplify' : 'radio' });
      const whenText = at.toLocaleString(undefined, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      setDone(repeatWeeks > 1 ? t('scheduleRadio.doneRepeat', { when: whenText, weeks: repeatWeeks }) : t('scheduleRadio.done', { when: whenText }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.box} testID="schedule-radio">
      <Text style={type.heading}>{t('scheduleRadio.title')}</Text>
      <Text style={type.small}>{t('scheduleRadio.hint')}</Text>
      <View style={styles.row}>
        {WHEN_OPTIONS.map((o) => (
          <Chip radio key={o.key} label={t(`actions.whenOptions.${o.key}`, { defaultValue: o.label })} selected={when === o.key} onPress={() => setWhen(o.key)} />
        ))}
        <Chip radio label={t('actions.pickTime')} selected={when === 'custom'} onPress={() => setWhen('custom')} />
      </View>
      {when === 'custom' ? <Field placeholder={t('actions.timeFormat')} value={custom} onChangeText={setCustom} maxLength={16} /> : null}
      <View style={styles.row}>
        {REPEAT_OPTIONS.map((o) => (
          <Chip radio key={o.weeks} label={o.weeks === 1 ? t('actions.once') : t('actions.weeklyFor', { count: o.weeks })} selected={repeatWeeks === o.weeks} onPress={() => setRepeatWeeks(o.weeks)} />
        ))}
      </View>
      {canAmplify ? (
        <View style={styles.row}>
          <Chip radio label={t('scheduleRadio.once')} selected={!amplify} onPress={() => setAmplify(false)} />
          <Chip radio label={t('scheduleRadio.amplified')} selected={amplify} onPress={() => setAmplify(true)} />
        </View>
      ) : null}
      <Button label={t('scheduleRadio.submit')} busy={busy} disabled={!at} onPress={submit} />
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
