// My prayer chain (docs/GROWTH.md): the people already on the member's email
// prayer chain. Each address confirms by email first; every email has a stop link.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type ChainPerson } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function PrayerChainScreen() {
  const { t } = useLocale();
  const [people, setPeople] = useState<ChainPerson[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.prayerChain().then((r) => (setPeople(r.people), setError(null)), (e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  const add = () =>
    api.addToPrayerChain(email.trim()).then(
      () => {
        setEmail('');
        load();
      },
      (e) => setError((e as Error).message),
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('growth.chainTitle')}</Text>
        <Text style={type.body}>{t('growth.chainIntro')}</Text>
        <Field label={t('growth.chainEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" maxLength={254} />
        <Button label={t('growth.chainAdd')} disabled={!email.includes('@')} onPress={add} />
        <ErrorText error={error} onRetry={people ? undefined : load} />
        {!people && !error ? <Loading /> : null}
        {people?.length === 0 ? <Empty text={t('growth.chainEmpty')} /> : null}
        {people?.map((p) => (
          <View key={p.id} style={styles.card}>
            <Text style={type.body}>{p.email}</Text>
            <Text style={type.small}>{t(`growth.chainStatus.${p.status}`)}</Text>
            <Button small variant="ghost" label={t('growth.chainRemove')} onPress={() => api.removeFromPrayerChain(p.id).then(load, (e) => setError((e as Error).message))} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
});
