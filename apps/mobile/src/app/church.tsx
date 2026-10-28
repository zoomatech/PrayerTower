// Church partners: a pastor applies for their church. An admin checks it and
// verifies it, and then a "Pastor · <church>" badge shows on the requests the
// pastor posts under their name. Pending applications can be edited or withdrawn.
import type { Church, ChurchApplicationInput } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const EMPTY: Required<ChurchApplicationInput> = { name: '', denomination: '', pastorTitle: '', city: '', region: '', country: '', website: '', phone: '', about: '' };

export default function ChurchScreen() {
  const { t } = useLocale();
  const { refreshProfile } = useAuth();
  const [church, setChurch] = useState<Church | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.myChurch();
      setChurch(r.church);
      setEditing(!r.church);
      if (r.church?.status === 'verified') await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, [refreshProfile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const startEdit = (from: Church | null) => {
    setForm(
      from
        ? { name: from.name, denomination: from.denomination ?? '', pastorTitle: from.pastorTitle, city: from.city, region: from.region ?? '', country: from.country, website: from.website ?? '', phone: from.phone ?? '', about: from.about ?? '' }
        : EMPTY,
    );
    setEditing(true);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const input: ChurchApplicationInput = { ...form, pastorTitle: form.pastorTitle.trim() || undefined };
      const r = church?.status === 'pending' ? await api.editChurch(input) : await api.applyChurch(input);
      setChurch(r.church);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const set = (key: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const ready = form.name.trim().length >= 2 && form.city.trim() && form.country.trim().length >= 2;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
        <Text style={type.title}>{t('church.title')}</Text>
        <Text style={type.body}>{t('church.intro')}</Text>
        <ErrorText error={error} />

        {loaded && church && !editing ? (
          <View style={styles.card}>
            <Text style={styles.status}>{t(`church.status.${church.status}`)}</Text>
            <Text style={type.heading}>{church.name}</Text>
            <Text style={type.body}>
              {[church.pastorTitle, church.denomination, [church.city, church.region, church.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
            </Text>
            {church.status === 'pending' ? <Text style={type.small}>{t('church.pendingHint')}</Text> : null}
            {church.status === 'verified' ? <Text style={type.small}>{t('church.verifiedHint', { badge: `${church.pastorTitle} · ${church.name}` })}</Text> : null}
            {church.status === 'declined' && church.reviewNote ? <Text style={type.body}>{t('church.note', { note: church.reviewNote })}</Text> : null}
            <View style={styles.row}>
              {church.status === 'pending' ? (
                <>
                  <Button small variant="secondary" label={t('church.edit')} onPress={() => startEdit(church)} />
                  <Button small variant="ghost" label={t('church.withdraw')} onPress={() => api.withdrawChurch().then(load).catch((e) => setError((e as Error).message))} />
                </>
              ) : null}
              {church.status === 'declined' ? <Button small label={t('church.applyAgain')} onPress={() => startEdit(church)} /> : null}
            </View>
          </View>
        ) : null}

        {loaded && editing ? (
          <View style={{ gap: space.md }}>
            <Field label={t('church.name')} value={form.name} onChangeText={set('name')} maxLength={120} />
            <Field label={t('church.pastorTitle')} placeholder={t('church.pastorTitlePlaceholder')} value={form.pastorTitle} onChangeText={set('pastorTitle')} maxLength={60} />
            <Field label={t('church.denomination')} value={form.denomination} onChangeText={set('denomination')} maxLength={80} />
            <Field label={t('church.city')} value={form.city} onChangeText={set('city')} maxLength={80} />
            <Field label={t('church.region')} value={form.region} onChangeText={set('region')} maxLength={80} />
            <Field label={t('church.country')} value={form.country} onChangeText={set('country')} maxLength={60} />
            <Field label={t('church.website')} placeholder="https://" value={form.website} onChangeText={set('website')} maxLength={200} autoCapitalize="none" keyboardType="url" />
            <Field label={t('church.phone')} value={form.phone} onChangeText={set('phone')} maxLength={40} keyboardType="phone-pad" />
            <Field label={t('church.about')} value={form.about} onChangeText={set('about')} maxLength={1000} multiline />
            <Text style={type.small}>{t('church.checkHint')}</Text>
            <View style={styles.row}>
              <Button label={church?.status === 'pending' ? t('church.save') : t('church.submit')} disabled={!ready || busy} onPress={submit} />
              {church ? <Button variant="ghost" label={t('common.cancel')} onPress={() => setEditing(false)} /> : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  status: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
