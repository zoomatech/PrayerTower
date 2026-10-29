// Prayer circles (docs/GROWTH_PRACTICES.md): the member's invite-only small groups, a way to
// start one, and a way to join with a code. Off unless Admin → Growth practices turns it on.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type CircleSummary } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function Circles() {
  const t = useT();
  const [circles, setCircles] = useState<CircleSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.myCircles().then(
      (r) => {
        setCircles(r.circles);
        setError(null);
      },
      (e) => setError((e as Error).message),
    );
  }, []);
  useEffect(load, [load]);

  const go = async (fn: () => Promise<{ id: string }>) => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await fn();
      router.push(`/circles/${id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} role="heading">
          {t('circles.title')}
        </Text>
        <Text style={type.small}>{t('circles.intro')}</Text>
        <ErrorText error={error} onRetry={load} />
        {!circles && !error ? <Loading /> : null}
        {circles && !circles.length ? <Empty text={t('circles.none')} /> : null}
        {circles?.map((c) => (
          <Pressable
            key={c.id}
            testID={`circle-${c.id}`}
            role="link"
            style={styles.card}
            onPress={() => router.push(`/circles/${c.id}`)}>
            <Text style={type.heading}>{c.name}</Text>
            {c.about ? <Text style={type.body}>{c.about}</Text> : null}
            <Text style={type.small}>
              {t('circles.members', { count: c.members })}
              {c.isOwner ? ` · ${t('circles.youStarted')}` : ''}
            </Text>
          </Pressable>
        ))}
        <View style={styles.card}>
          <Text style={type.heading} role="heading">
            {t('circles.start')}
          </Text>
          <Field label={t('circles.name')} value={name} onChangeText={setName} maxLength={60} />
          <Field label={t('circles.about')} value={about} onChangeText={setAbout} maxLength={300} multiline />
          <Button small label={t('circles.create')} busy={busy} disabled={!name.trim()} onPress={() => go(() => api.createCircle(name.trim(), about.trim() || undefined))} />
        </View>
        <View style={styles.card}>
          <Field label={t('circles.joinCode')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} maxLength={8} autoCapitalize="characters" autoCorrect={false} />
          <Button small variant="secondary" label={t('circles.join')} busy={busy} disabled={code.trim().length !== 8} onPress={() => go(() => api.joinCircle(code.trim()))} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
