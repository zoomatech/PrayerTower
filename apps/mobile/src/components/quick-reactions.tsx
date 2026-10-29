// Quick reactions (long-press a post): "Light a candle" 🕯️ and "Standing with you" ❤️.
// Shown only while an admin has the "Quick reactions on long-press" switch on.
import type { Card, QuickReactionKind } from '@prayer-tower/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

const KINDS: { kind: QuickReactionKind; icon: string }[] = [
  { kind: 'candle', icon: '🕯️' },
  { kind: 'standing', icon: '❤️' },
];

export type QuickCounts = { candles: number; standing: number; mine: QuickReactionKind[] };

export function QuickReactionTray({ card, onChange, onClose }: { card: Card; onChange: (c: QuickCounts) => void; onClose: () => void }) {
  const { t } = useLocale();
  const [mine, setMine] = useState<QuickReactionKind[]>(card.myQuickReactions ?? []);
  const [counts, setCounts] = useState({ candle: card.counts.candles ?? 0, standing: card.counts.standing ?? 0 });
  const [error, setError] = useState<string | null>(null);

  const toggle = async (kind: QuickReactionKind) => {
    const on = !mine.includes(kind);
    try {
      const r = await api.quickReact(card.id, kind, on);
      setMine(r.mine);
      setCounts({ candle: r.candles, standing: r.standing });
      // The card's counts line updates too.
      onChange(r);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <View style={styles.tray} role="group" aria-label={t('quick.tray')}>
      {KINDS.map(({ kind, icon }) => {
        const on = mine.includes(kind);
        return (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t(`quick.${kind}`)}, ${counts[kind]}`}
            onPress={() => toggle(kind)}
            style={({ pressed }) => [styles.choice, on && styles.on, pressed && { opacity: 0.6 }]}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={[styles.label, on && { color: colors.primary }]}>{t(`quick.${kind}`)}</Text>
            {counts[kind] > 0 ? <Text style={type.small}>{counts[kind]}</Text> : null}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel={t('quick.close')} onPress={onClose} style={styles.close}>
        <Text style={type.small}>✕</Text>
      </Pressable>
      {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, padding: space.sm,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  on: { borderColor: colors.primary },
  icon: { fontSize: 18 },
  label: { fontSize: 15, color: colors.text },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  error: { width: '100%', color: colors.danger },
});
