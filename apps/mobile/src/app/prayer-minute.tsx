// Prayer minute (docs/GROWTH.md): one minute a day the member chose, prayed
// alongside everyone who chose it. The live count is real: people with this
// screen open in the last two minutes. Requests stay open afterward, so
// nothing is lost by missing the minute.
import type { Card } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type PrayerMinute, type PrayerMinuteNow } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export default function PrayerMinuteScreen() {
  const { t } = useLocale();
  const [minute, setMinute] = useState<PrayerMinute | null>(null);
  const [now, setNow] = useState<PrayerMinuteNow | null>(null);
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.prayerMinute().then(
      (r) => {
        setMinute(r.minute);
        if (r.minute.enabled && r.minute.time) setTime(r.minute.time);
      },
      (e) => setError((e as Error).message),
    );
    api.joinPrayerMinute()
      .then(() => api.prayerMinuteNow())
      .then((r) => setNow(r.now), () => undefined);
  }, []);

  // While the screen is open, say so every 30 seconds and refresh the count.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => {
        api.joinPrayerMinute()
          .then(() => api.prayerMinuteNow())
          .then((r) => setNow(r.now), () => undefined);
      }, 30_000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const save = () => api.setPrayerMinute(time.trim(), zone()).then((r) => (setMinute(r.minute), setError(null)), (e) => setError((e as Error).message));
  const clear = () => api.clearPrayerMinute().then(load, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('growth.minuteTitle')}</Text>
        <ErrorText error={error} />
        {!minute ? <Loading /> : null}
        {now?.enabled ? (
          <View style={styles.live}>
            <Text style={type.heading}>{now.together > 1 ? t('growth.minuteTogether', { count: now.together }) : t('growth.minuteTogetherOne')}</Text>
            <Text style={type.body}>{t('growth.minuteRequests')}</Text>
            {now.requests.length === 0 ? <Text style={type.small}>{t('growth.minuteNoRequests')}</Text> : null}
            {now.requests.map((c: Card) => (
              <Text key={c.id} style={[type.body, styles.request]} onPress={() => router.push(`/post/${c.id}`)} accessibilityRole="link">
                “{c.preview || c.body}”
              </Text>
            ))}
          </View>
        ) : null}
        {minute?.enabled ? (
          <View style={styles.box}>
            <Text style={type.body}>{t('growth.minuteIntro')}</Text>
            <Text style={type.small}>
              {minute.time ? t('growth.minuteSaved', { time: minute.time, zone: minute.timeZone ?? '' }) : t('growth.minuteNone')}
              {minute.time && minute.others > 0 ? ` ${t('growth.minuteOthers', { count: minute.others })}` : ''}
            </Text>
            <Field label={t('growth.minuteTime')} value={time} onChangeText={setTime} placeholder="07:00" keyboardType="numbers-and-punctuation" maxLength={5} />
            <Button label={t('growth.minuteSave')} disabled={!/^\d{2}:\d{2}$/.test(time.trim())} onPress={save} />
            {minute.time ? <Button variant="ghost" label={t('growth.minuteClear')} onPress={clear} /> : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  box: { gap: space.sm },
  live: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  request: { paddingVertical: space.xs },
});
