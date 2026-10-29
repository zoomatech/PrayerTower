// Why we run on gifts, not ads: the same words as the website's /why-donations page,
// loaded from the server so there is one copy. Shown on Me only while switched on
// (Admin → Notebook ideas). Give opens Me → Give, and shows only while giving is on (Admin → Giving).
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type GivingInfo, type WhyGifts as Copy } from '@/lib/api';
import { env } from '@/lib/env';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function WhyGifts() {
  const { t, wording } = useLocale();
  const [copy, setCopy] = useState<Copy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [giving, setGiving] = useState<GivingInfo | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.whyGifts(wording).then(setCopy, (e) => setError((e as Error).message));
    api.givingInfo().then(setGiving, () => setGiving(null));
  }, [wording]);
  useFocusEffect(load);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        {error ? <ErrorText error={error} onRetry={load} /> : copy === null ? <Loading /> : null}
        {copy ? (
          <>
            <Text style={type.title} accessibilityRole="header">
              {copy.title}
            </Text>
            <Text style={type.body}>{copy.intro}</Text>
            {copy.points.map((p) => (
              <View key={p.heading} style={styles.card}>
                <Text style={styles.heading}>{p.heading}</Text>
                <Text style={type.body}>{p.body}</Text>
              </View>
            ))}
            {giving?.enabled ? <Button label={t('whyGifts.give')} onPress={() => router.push('/give')} /> : null}
            {copy.fundPath ? (
              <Button variant="secondary" label={t('whyGifts.report')} onPress={() => void WebBrowser.openBrowserAsync(`${env.apiUrl}${copy.fundPath}`)} />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: { gap: space.xs, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heading: { ...type.body, fontWeight: '700' },
});
