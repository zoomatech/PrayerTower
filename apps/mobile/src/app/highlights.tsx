import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { Highlights } from '@/components/highlights';
import { Button, ErrorText, Screen } from '@/components/ui';
import { api, type Highlights as Data } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export default function HighlightsScreen() {
  const { t } = useLocale();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.highlights().then(setData, (e) => setError((e as Error).message));
  }, []);
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('highlights.thisWeek')}</Text>
        <ErrorText error={error} />
        <Highlights data={data} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { padding: space.lg, gap: space.lg, paddingBottom: 80 } });
