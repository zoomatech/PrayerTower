// Kindness highlights (docs/GROWTH_PRACTICES.md): this week's and last week's examples
// of members lifting each other up, words only. Below them, anything you've been asked
// to share: say yes or no, or withdraw a yes at any time.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type HighlightAsks, type KindnessHighlights } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const weekOf = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

export default function HighlightsScreen() {
  const t = useT();
  const [h, setH] = useState<KindnessHighlights | null>(null);
  const [asks, setAsks] = useState<HighlightAsks | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.kindnessHighlights(), api.highlightAsks()]).then(
      ([a, b]) => {
        setH(a);
        setAsks(b);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, []);
  useEffect(load, [load]);

  const act = (p: Promise<HighlightAsks>) => p.then(setAsks, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} role="heading">
          {t('highlightsKind.title')}
        </Text>
        <Text style={type.body}>{t('highlightsKind.intro')}</Text>
        <ErrorText error={error} onRetry={h ? undefined : load} />
        {!h && !error ? <Loading /> : null}
        {h?.enabled && !h.weeks.length ? <Empty text={t('highlightsKind.empty')} /> : null}
        {h?.weeks.map((w) => (
          <View key={w.week} style={styles.week}>
            <Text style={type.heading} role="heading">
              {t('highlightsKind.weekOf', { date: weekOf(w.week) })}
            </Text>
            {w.items.map((i) => (
              <Text key={i.id} style={[type.body, styles.quote]}>
                “{i.text}”
              </Text>
            ))}
          </View>
        ))}
        {asks?.asks.length ? (
          <View style={styles.week}>
            <Text style={type.heading} role="heading">
              {t('highlightsKind.askedTitle')}
            </Text>
            {asks.asks.map((a) => (
              <View key={a.id} style={styles.ask}>
                <Text style={[type.body, styles.quote]}>“{a.body}”</Text>
                {a.status === 'asked' ? (
                  <>
                    <Text style={type.small}>{t('highlightsKind.askedQuestion')}</Text>
                    <View style={styles.row}>
                      <Button small label={t('highlightsKind.yes')} onPress={() => act(api.answerHighlightAsk(a.id, true))} />
                      <Button small variant="secondary" label={t('highlightsKind.no')} onPress={() => act(api.answerHighlightAsk(a.id, false))} />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={type.small}>{a.status === 'picked' ? t('highlightsKind.picked') : t('highlightsKind.consented')}</Text>
                    <Button small variant="ghost" label={t('highlightsKind.withdraw')} onPress={() => act(api.withdrawHighlight(a.id))} />
                  </>
                )}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  week: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  quote: { fontStyle: 'italic' },
  ask: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
