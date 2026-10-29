// Weekly intention (docs/GROWTH_PRACTICES.md): the member may choose how many days a week they
// mean to pray, 1 to 6, so rest is part of every week. The dots only fill in; a week that falls
// short is never mentioned, and the count starts fresh each Monday. Off unless Admin → Growth
// practices turns it on.
import type { PrayerStats } from '@prayer-tower/shared';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, space, type } from '@/lib/theme';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const CHOICES = [1, 2, 3, 4, 5, 6] as const;

export function WeeklyIntention({ intention: i, onChange }: { intention: NonNullable<PrayerStats['intention']>; onChange: (s: PrayerStats) => void }) {
  const t = useT();
  const choose = (days: number | null) =>
    api.setWeeklyIntention(days, zone()).then(
      (r) => {
        onChange(r.stats);
        announce(days === null ? t('intention.none') : t('intention.chosen', { count: days }));
      },
      () => undefined,
    );
  return (
    <View style={styles.box} testID="weekly-intention">
      <Text style={type.body}>{t('intention.title')}</Text>
      <View style={styles.row} role="radiogroup" aria-label={t('intention.title')}>
        <Chip radio label={t('intention.noneChip')} selected={i.days === null} onPress={() => choose(null)} />
        {CHOICES.map((n) => (
          <Chip key={n} radio label={t('intention.days', { count: n })} selected={i.days === n} onPress={() => choose(n)} />
        ))}
      </View>
      {i.days !== null ? (
        <>
          <View style={styles.row} accessible accessibilityLabel={t('intention.shown', { count: i.shown })}>
            {i.week.map((d) => (
              <View key={d.date} style={[styles.dot, d.prayed && styles.dotOn]} />
            ))}
          </View>
          <Text style={type.small}>{i.met ? t('intention.met') : t('intention.shown', { count: i.shown })}</Text>
        </>
      ) : null}
      <Text style={type.small}>{t('intention.rest')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.border },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
