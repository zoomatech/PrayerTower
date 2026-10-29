// Fresh starts on days that matter (docs/GROWTH_PRACTICES.md): up to three of the member's own
// dates, and in faith wording the first days of Advent, Lent and Easter. On the day, "Your prayer
// life" invites one small intention; nothing is said on other days and nothing is pushed. Off
// unless Admin → Growth practices turns it on.
import type { PrayerStats } from '@prayer-tower/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { api, type FreshStartDay } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export const MAX_FRESH_DAYS = 3;

export function FreshDayLine({ day }: { day: NonNullable<PrayerStats['freshDay']> }) {
  const { t } = useLocale();
  return (
    <Text style={type.body} testID="fresh-day">
      {'label' in day ? t('freshDays.today', { label: day.label }) : t(`freshDays.${day.season}`)}
    </Text>
  );
}

export function FreshDaysCard() {
  const { freshDays } = useFeatures();
  const { t, language } = useLocale();
  const [days, setDays] = useState<FreshStartDay[] | null>(null);
  const [label, setLabel] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!freshDays) return;
    api.freshDays().then((r) => setDays(r.days), (e) => setError((e as Error).message));
  }, [freshDays]);
  if (!freshDays || !days) return null;

  const run = (fn: () => Promise<{ days: FreshStartDay[] }>) =>
    fn().then(
      (r) => {
        setDays(r.days);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  const m = Number(month);
  const d = Number(day);
  const valid = label.trim() && Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31;
  const when = (x: FreshStartDay) => new Date(Date.UTC(2024, x.month - 1, x.day)).toLocaleDateString(language, { month: 'long', day: 'numeric', timeZone: 'UTC' });

  return (
    <View style={styles.card} testID="fresh-days-card">
      <Text style={type.heading} role="heading">
        {t('freshDays.title')}
      </Text>
      <Text style={type.small}>{t('freshDays.intro')}</Text>
      {days.map((x) => (
        <View key={x.id} style={styles.row}>
          <Text style={[type.body, styles.grow]}>
            {x.label} · {when(x)}
          </Text>
          <Button small variant="ghost" label={t('freshDays.remove')} a11yLabel={t('freshDays.removeOne', { label: x.label })} onPress={() => run(() => api.removeFreshDay(x.id))} />
        </View>
      ))}
      {days.length < MAX_FRESH_DAYS ? (
        <>
          <Field label={t('freshDays.label')} value={label} onChangeText={setLabel} maxLength={40} />
          <View style={styles.row}>
            <View style={styles.grow}>
              <Field label={t('freshDays.month')} keyboardType="number-pad" value={month} onChangeText={setMonth} maxLength={2} />
            </View>
            <View style={styles.grow}>
              <Field label={t('freshDays.day')} keyboardType="number-pad" value={day} onChangeText={setDay} maxLength={2} />
            </View>
          </View>
          {month && day && !valid ? (
            <Text style={type.small} aria-live="polite" testID="fresh-days-check">
              {t('freshDays.check')}
            </Text>
          ) : null}
          <Button
            small
            variant="secondary"
            label={t('freshDays.add')}
            disabled={!valid}
            onPress={() =>
              run(async () => {
                const r = await api.addFreshDay({ month: m, day: d, label: label.trim() });
                setLabel('');
                setMonth('');
                setDay('');
                return r;
              })
            }
          />
        </>
      ) : null}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  grow: { flex: 1, minWidth: 120 },
});
