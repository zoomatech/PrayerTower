// The members' kindness research page (docs/CONVERSATION_HELPERS.md): the anonymous
// Counting patterns totals as simple bar charts. Only move labels and emoji meanings
// are counted, never words or names, and anything seen fewer than five times is folded
// into "other". Off unless Admin → Conversation helpers turns it on.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type MeaningEmoji, type TalkCountSummary } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

/** At most this many bars a chart; the rest join the "other" line. */
const MAX_BARS = 8;

type Bar = { key: string; label: string; n: number };

/** One series, ranked: the title names it, each bar carries its own value. */
function BarChart({ title, bars, other, testID }: { title: string; bars: Bar[]; other: number; testID: string }) {
  const { t } = useLocale();
  const shown = bars.slice(0, MAX_BARS);
  const rest = other + bars.slice(MAX_BARS).reduce((s, b) => s + b.n, 0);
  const max = Math.max(1, ...shown.map((b) => b.n));
  return (
    <View style={styles.chart} testID={testID}>
      <Text style={type.heading} role="heading">
        {title}
      </Text>
      {shown.map((b) => (
        <View key={b.key} style={styles.row} accessible accessibilityLabel={t('research.barLabel', { label: b.label, n: b.n })}>
          <Text style={type.body}>{b.label}</Text>
          <View style={styles.barLine}>
            <View style={[styles.bar, { flex: b.n / max }]} />
            <View style={{ flex: 1 - b.n / max }} />
            <Text style={styles.value}>{b.n}</Text>
          </View>
        </View>
      ))}
      {rest ? <Text style={type.small}>{t('research.other', { min: 5, n: rest })}</Text> : null}
    </View>
  );
}

export default function KindnessResearch() {
  const { t, wording } = useLocale();
  const [c, setC] = useState<TalkCountSummary | null>(null);
  const [tree, setTree] = useState<MeaningEmoji[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.kindnessResearch().then(
      (r) => {
        setC(r.counts);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
    // Emoji and meaning words, when Emoji meanings is on; otherwise the plain names.
    api.reactionMeanings().then(
      (r) => setTree(r.emoji),
      () => undefined,
    );
  }, []);
  useEffect(load, [load]);

  const move = (m: string) => t(`talk.move.${m}`);
  const meaning = (emoji: string, key: string) => {
    const e = tree.find((x) => x.key === emoji);
    const m = e?.meanings.find((x) => x.key === key);
    return e && m ? `${e.emoji} ${wording === 'neutral' ? m.neutralLabel : m.label}` : `${emoji} ${key}`;
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} role="heading">
          {t('research.title')}
        </Text>
        <Text style={type.small}>{t('research.intro')}</Text>
        <ErrorText error={error} onRetry={load} />
        {!c && !error ? <Loading /> : null}
        {c && !c.chains.length && !c.emoji.length && !c.otherChains && !c.otherEmoji ? <Empty text={t('research.empty')} /> : null}
        {c && (c.chains.length || c.otherChains) ? (
          <BarChart
            testID="research-chains"
            title={t('research.chains', { weeks: c.weeks })}
            bars={c.chains.map((r) => ({ key: r.moves.join('-'), label: r.moves.map(move).join(' → '), n: r.n }))}
            other={c.otherChains}
          />
        ) : null}
        {c && (c.emoji.length || c.otherEmoji) ? (
          <BarChart
            testID="research-emoji"
            title={t('research.emoji', { weeks: c.weeks })}
            bars={c.emoji.map((r) => ({ key: `${r.emoji}-${r.meaning}-${r.toMove}`, label: t('research.emojiRow', { what: meaning(r.emoji, r.meaning), move: move(r.toMove) }), n: r.n }))}
            other={c.otherEmoji}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  chart: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { gap: 4 },
  barLine: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bar: { height: 10, minWidth: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: colors.primary },
  value: { ...type.small, color: colors.text, minWidth: 28, textAlign: 'right' },
});
