// Menu → Settings → Themes → Full Screen Sparkler Theme → Background choices (Steve, 2026-11-01):
// the posts' background, chosen like Facebook post backgrounds: solid color blocks, starfields,
// flowers and textures.
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Screen } from '@/components/ui';
import { BackgroundSwatch } from '@/layouts/sparkler';
import { useT } from '@/lib/i18n';
import { setSparklerBackground, SPARKLER_BACKGROUNDS, SPARKLER_GROUPS, useSparklerBackground } from '@/lib/sparkler-backgrounds';
import { colors, radius, space, type } from '@/lib/theme';

export default function SparklerBackgrounds() {
  const t = useT();
  const current = useSparklerBackground();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/sparkler-theme'))} />
        <Text style={type.title} role="heading">
          {t('themes.backgrounds')}
        </Text>
        <Text style={type.body}>{t('themes.backgroundsHint')}</Text>
        {SPARKLER_GROUPS.map((g) => (
          <View key={g} style={styles.group}>
            <Text style={type.heading} role="heading">
              {t(`themes.groups.${g}`)}
            </Text>
            <View style={styles.grid}>
              {SPARKLER_BACKGROUNDS.filter((b) => b.group === g).map((b) => {
                const on = b.id === current.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setSparklerBackground(b.id)}
                    accessibilityRole="radio"
                    aria-checked={on}
                    aria-label={b.name}
                    style={[styles.choice, on && styles.choiceOn]}
                    testID={`background-${b.id}`}>
                    <BackgroundSwatch id={b.id} size={72} />
                    <Text style={styles.name} numberOfLines={2}>
                      {b.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg },
  group: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  choice: { width: 88, alignItems: 'center', gap: 4, padding: 6, borderRadius: radius.md, borderWidth: 2, borderColor: 'transparent' },
  choiceOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  name: { fontSize: 14, textAlign: 'center', color: colors.text },
});
