// Menu → Settings → Themes → Full Screen Sparkler Theme (Steve, 2026-11-01).
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { MenuRow } from '@/components/menu-row';
import { Button, Screen } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export default function SparklerTheme() {
  const t = useT();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/themes'))} />
        <Text style={type.title} role="heading">
          {t('themes.sparkler')}
        </Text>
        <MenuRow label={t('themes.backgrounds')} onPress={() => router.push('/sparkler-backgrounds')} testID="sparkler-backgrounds" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { padding: space.lg, gap: space.md } });
