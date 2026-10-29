// Answered & remembered (docs/GROWTH_PRACTICES.md): a look-back the member opens
// when they choose, never a push. Only their own answered requests with a grateful
// word; requests about a death or loss never show, and any item can be hidden.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type RememberedItem } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export default function RememberedScreen() {
  const { t } = useLocale();
  const [items, setItems] = useState<RememberedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.remembered().then((r) => (setItems(r.items), setError(null)), (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const hide = (id: string) => api.hideRemembered(id).then((r) => setItems(r.items), (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('practices.rememberedTitle')}</Text>
        <Text style={type.body}>{t('practices.rememberedIntro')}</Text>
        <ErrorText error={error} onRetry={items ? undefined : load} />
        {!items && !error ? <Loading /> : null}
        {items && !items.length ? <Empty text={t('practices.rememberedEmpty')} /> : null}
        {items?.map((i) => (
          <View key={i.id} style={styles.item} testID={`remembered-${i.id}`}>
            <Text style={type.small}>{t('practices.rememberedAnswered', { date: day(i.answeredAt) })}</Text>
            <Text style={type.body} onPress={() => router.push(`/post/${i.id}`)}>
              {i.body}
            </Text>
            {i.testimony ? <Text style={[type.body, styles.grateful]}>{i.testimony}</Text> : null}
            <Button small variant="ghost" label={t('practices.rememberedHide')} onPress={() => hide(i.id)} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  item: { gap: space.xs, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  grateful: { fontStyle: 'italic', color: colors.primary },
});
