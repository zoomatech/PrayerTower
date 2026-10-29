// My meaning words (docs/CONVERSATION_HELPERS.md): choose the word each emoji adds
// first, and hide words you would rather not use. Only your own tray changes.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type MeaningEmoji, type MeaningPref } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function MeaningWordsScreen() {
  const { t, wording } = useLocale();
  const [tree, setTree] = useState<MeaningEmoji[] | null>(null);
  const [prefs, setPrefs] = useState<MeaningPref[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.meaningWords().then(
      (r) => {
        setTree(r.emoji);
        setPrefs(r.prefs);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, []);
  useEffect(load, [load]);

  const prefFor = (emoji: string): MeaningPref => prefs.find((p) => p.emoji === emoji) ?? { emoji, defaultMeaning: null, hidden: [] };
  const save = (p: MeaningPref) => api.setMeaningWords(p).then((r) => setPrefs(r.prefs), (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('talk.meaningWordsTitle')}</Text>
        <Text style={type.body}>{t('talk.meaningWordsIntro')}</Text>
        <ErrorText error={error} onRetry={tree ? undefined : load} />
        {!tree && !error ? <Loading /> : null}
        {tree?.map((e) => {
          const p = prefFor(e.key);
          const first = p.defaultMeaning ?? e.meanings[0]?.key;
          return (
            <View key={e.key} style={styles.emoji}>
              <Text style={styles.big}>{e.emoji}</Text>
              {e.meanings.map((m) => {
                const hidden = p.hidden.includes(m.key);
                return (
                  <View key={m.key} style={styles.row}>
                    <Text style={[type.body, styles.word, hidden && styles.hidden]}>{wording === 'neutral' ? m.neutralLabel : m.label}</Text>
                    <Chip radio label={t('talk.meaningFirst')} selected={first === m.key} onPress={() => save({ ...p, defaultMeaning: m.key, hidden: p.hidden.filter((h) => h !== m.key) })} />
                    <Chip
                      label={hidden ? t('talk.meaningShow') : t('talk.meaningHide')}
                      selected={hidden}
                      onPress={() => save({ ...p, hidden: hidden ? p.hidden.filter((h) => h !== m.key) : [...p.hidden, m.key] })}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  emoji: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  big: { fontSize: 28 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  word: { flexGrow: 1, minWidth: 140 },
  hidden: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
