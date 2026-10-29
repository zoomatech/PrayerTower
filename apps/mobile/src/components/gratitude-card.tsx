// "Three good things" (docs/GROWTH_PRACTICES.md): a private weekly card on Me, with
// an optional reminder on the day the member picks. Once a week, because counting
// blessings weekly helped where three times a week did not (Lyubomirsky, in
// research/Personal_Growth_Research.md). A skipped week is never mentioned.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field } from '@/components/ui';
import { api, type Gratitude } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function GratitudeCard() {
  const { gratitudeCard } = useFeatures();
  const t = useT();
  const [g, setG] = useState<Gratitude | null>(null);
  const [items, setItems] = useState(['', '', '']);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (x: Gratitude) => {
    setG(x);
    if (x.enabled) setItems([0, 1, 2].map((i) => x.items[i] ?? ''));
  };
  useEffect(() => {
    if (!gratitudeCard) return;
    api
      .gratitude(zone())
      .then(show)
      .catch((e) => setError((e as Error).message));
  }, [gratitudeCard]);

  if (!gratitudeCard || !g?.enabled) return null;
  const filled = items.map((i) => i.trim()).filter(Boolean);

  const run = async (fn: () => Promise<Gratitude>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      show(await fn());
      setNote(done ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="gratitude-card">
      <Text style={type.heading}>{t('practices.gratitudeTitle')}</Text>
      <Text style={type.small}>{t('practices.gratitudeIntro')}</Text>
      {items.map((v, i) => (
        <Field
          key={i}
          label={t('practices.gratitudeItem', { n: i + 1 })}
          value={v}
          maxLength={280}
          onChangeText={(text) => setItems((cur) => cur.map((c, j) => (j === i ? text : c)))}
        />
      ))}
      <View style={styles.row}>
        <Button small label={t('practices.gratitudeSave')} busy={busy} onPress={() => run(() => api.saveGratitude(filled, zone()), t('practices.gratitudeSaved'))} />
        {filled.length ? (
          <Button
            small
            variant="secondary"
            label={t('practices.gratitudeShare')}
            onPress={() =>
              router.push({
                pathname: '/compose',
                params: { type: 'praise', body: filled.join('\n') },
              })
            }
          />
        ) : null}
      </View>
      {note ? <Text style={type.small}>{note}</Text> : null}
      <Text style={type.small}>{t('practices.gratitudeDay')}</Text>
      <View style={styles.row} role="radiogroup">
        <Chip radio label={t('practices.gratitudeDayOff')} selected={g.weekday === null} onPress={() => run(() => api.setGratitudeDay(null, zone()))} />
        {DAYS.map((d) => (
          <Chip key={d} radio label={t(`practices.days.d${d}`)} selected={g.weekday === d} onPress={() => run(() => api.setGratitudeDay(d, zone()))} />
        ))}
      </View>
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
