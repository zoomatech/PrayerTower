// Private kindness milestones on Me: quiet markers only the member sees. Counts only
// grow, so nothing is ever lost, and nobody is ranked or compared. A milestone reached
// since last time is greeted once, then marked seen.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, type KindMilestone } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const ICON: Record<KindMilestone['metric'], string> = { people: '🌱', requests: '🕯️', encouragements: '💛', checkins: '🤝', words: '🍃' };

export function KindMilestones() {
  const { kindMilestones } = useFeatures();
  const t = useT();
  const [list, setList] = useState<KindMilestone[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!kindMilestones) return;
      let live = true;
      api.kindMilestones().then((r) => {
        if (!live) return;
        setList(r.milestones);
        // Greet the new ones on this visit, and not again.
        if (r.milestones.some((m) => m.new)) api.kindMilestonesSeen().catch(() => undefined);
      }, () => undefined);
      return () => {
        live = false;
      };
    }, [kindMilestones]),
  );

  if (!kindMilestones || !list?.length) return null;
  return (
    <View style={styles.card} testID="kind-milestones">
      <Text style={type.heading} accessibilityRole="header">
        {t('kindMilestones.title')}
      </Text>
      <Text style={type.small}>{t('kindMilestones.hint')}</Text>
      {list.map((m) => {
        const line = t(`kindMilestones.${m.metric}${m.level === 1 ? 'First' : 'Many'}`, { level: m.level });
        return (
          <View key={m.metric} style={styles.row} accessible accessibilityLabel={m.new ? `${t('kindMilestones.new')}: ${line}` : line}>
            <Text style={styles.icon} aria-hidden>
              {ICON[m.metric]}
            </Text>
            <Text style={[type.body, styles.line]}>{line}</Text>
            {m.new ? <Text style={styles.badge}>{t('kindMilestones.new')}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  icon: { fontSize: 20 },
  line: { flexShrink: 1 },
  badge: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
