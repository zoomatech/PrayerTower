// Circle goals (off unless an admin turns them on): the person who asked sets a shared
// goal, such as "50 people pray for this within a week". Progress counts different
// people who really prayed.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { api, type CircleGoal as Status } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

export function CircleGoal({ postId }: { postId: string }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status | null>(null);
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState('25');
  const [days, setDays] = useState('7');
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    api.circleGoal(postId).then(setStatus).catch(() => setStatus(null));
  }, [postId]);
  useEffect(load, [load]);

  if (!status?.enabled || (!status.goal && !status.canSet)) return null;
  const fail = (e: unknown) => setNote(errorText(e));
  const save = () =>
    api.setCircleGoal(postId, Number(target), Number(days)).then((s) => {
      setStatus(s);
      setEditing(false);
    }, fail);
  const g = status.goal;
  const ends = g ? new Date(g.endsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '';
  return (
    <View style={styles.section} role="group" aria-label={t('circleGoal.heading')}>
      <Text style={type.heading}>{t('circleGoal.heading')}</Text>
      {g ? (
        <>
          <Text style={type.body}>{t(g.met ? 'circleGoal.met' : 'circleGoal.progress', { done: g.prayed, target: g.target })}</Text>
          <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: g.target, now: Math.min(g.prayed, g.target) }}>
            <View style={[styles.fill, { width: `${Math.min(100, (g.prayed / g.target) * 100)}%` }]} />
          </View>
          <Text style={type.small}>{t(g.ended ? 'circleGoal.ended' : 'circleGoal.ends', { date: ends })}</Text>
        </>
      ) : null}
      {status.canSet ? (
        editing ? (
          <>
            <Field label={t('circleGoal.target')} value={target} onChangeText={setTarget} keyboardType="number-pad" maxLength={5} />
            <Field label={t('circleGoal.days')} value={days} onChangeText={setDays} keyboardType="number-pad" maxLength={2} />
            <Button small label={t('circleGoal.save')} disabled={!(Number(target) >= 2) || !(Number(days) >= 1)} onPress={save} />
          </>
        ) : (
          <View style={styles.row}>
            <Button small variant="secondary" label={t(g ? 'circleGoal.change' : 'circleGoal.set')} onPress={() => setEditing(true)} />
            {g ? <Button small variant="ghost" label={t('circleGoal.remove')} onPress={() => api.removeCircleGoal(postId).then(setStatus, fail)} /> : null}
          </View>
        )
      ) : null}
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  track: { height: 8, borderRadius: radius.lg, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.primary },
});
