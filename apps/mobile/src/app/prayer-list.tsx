// My prayer list (Annotated Read, chat 1): people and topics a member keeps to pray for,
// with an optional daily or weekly reminder. Off unless an admin turns it on. Private:
// only the member sees it, and "I prayed" earns no tokens and counts toward nothing.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type PrayerList, type PrayerListItem } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const REMIND = ['off', 'daily', 'weekly'] as const;

export default function PrayerListScreen() {
  const { t } = useLocale();
  const [list, setList] = useState<PrayerList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [remind, setRemind] = useState<PrayerListItem['remind']>('off');
  const [hour, setHour] = useState('9');

  const load = useCallback(() => {
    setError(null);
    Promise.resolve()
      .then(() => api.prayerList())
      .then(setList, (e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  const run = (p: Promise<PrayerList>) => p.then(setList, (e) => setError((e as Error).message));
  const hourNum = Math.min(23, Math.max(0, Number.parseInt(hour, 10) || 0));
  const add = () =>
    run(
      api.addToPrayerList({ name: name.trim(), note: note.trim(), remind, hour: hourNum, tzOffsetMinutes: new Date().getTimezoneOffset() }).then((r) => {
        setName('');
        setNote('');
        return r;
      }),
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} accessibilityRole="header">
          {t('prayerList.title')}
        </Text>
        {error ? <ErrorText error={error} onRetry={load} /> : list === null ? <Loading /> : null}
        {list && !list.enabled ? <Text style={type.body}>{t('prayerList.closed')}</Text> : null}
        {list?.enabled ? (
          <>
            <Text style={type.body}>{t('prayerList.intro')}</Text>
            <View style={styles.card}>
              <Field label={t('prayerList.name')} placeholder={t('prayerList.namePlaceholder')} value={name} onChangeText={setName} maxLength={80} />
              <Field label={t('prayerList.note')} value={note} onChangeText={setNote} maxLength={280} />
              <Text style={type.small}>{t('prayerList.remind')}</Text>
              <View style={styles.row}>
                {REMIND.map((r) => (
                  <Chip key={r} label={t(`prayerList.${r}`)} selected={remind === r} onPress={() => setRemind(r)} />
                ))}
              </View>
              {remind !== 'off' ? <Field label={t('prayerList.hour')} value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2} /> : null}
              <Button small label={t('prayerList.add')} disabled={!name.trim()} onPress={add} />
            </View>
            {list.items.length === 0 ? <Text style={type.small}>{t('prayerList.empty')}</Text> : null}
            {list.items.map((i) => (
              <View key={i.id} style={styles.card}>
                <Text style={styles.name}>{i.name}</Text>
                {i.note ? <Text style={type.body}>{i.note}</Text> : null}
                <Text style={type.small}>
                  {t(`prayerList.${i.remind}`)}
                  {i.prayedCount ? ` · ${t('prayerList.prayedCount', { count: i.prayedCount })}` : ''}
                </Text>
                <View style={styles.row}>
                  <Button small label={t('prayerList.prayed')} onPress={() => run(api.prayedForListItem(i.id))} />
                  <Button small variant="ghost" label={t('prayerList.remove')} onPress={() => run(api.removePrayerListItem(i.id))} />
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  name: { ...type.body, fontWeight: '700' },
});
