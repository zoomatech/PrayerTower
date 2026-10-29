// Notification settings: push on or off per kind of alert, and quiet hours.
// Turning a kind off only stops the phone alert; it still shows under Notices.
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPrefs } from '@prayer-tower/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { RadioPrefsSection } from '@/components/radio-summary';
import { Button, Chip, ErrorText, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

const STARTS = ['20:00', '21:00', '22:00', '23:00'];
const ENDS = ['06:00', '07:00', '08:00', '09:00'];
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export default function NotificationSettings() {
  const { profile, refreshProfile } = useAuth();
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const prefs: NotificationPrefs = profile?.notification_prefs ?? { off: [], quietHours: null };

  const save = async (next: NotificationPrefs) => {
    setError(null);
    try {
      await api.updateMe({ notificationPrefs: next });
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const setOn = (c: NotificationCategory, on: boolean) =>
    save({ ...prefs, off: on ? prefs.off.filter((x) => x !== c) : [...prefs.off, c] });
  const quiet = prefs.quietHours;
  // The window follows the phone's time zone, so it stays right after travel once saved again.
  const setQuiet = (patch: Partial<{ start: string; end: string }> | null) =>
    save({ ...prefs, quietHours: patch === null ? null : { start: '22:00', end: '07:00', ...quiet, ...patch, timeZone: deviceTimeZone() } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} role="heading">
          {t('notifySettings.title')}
        </Text>
        <Text style={type.body}>{t('notifySettings.intro')}</Text>
        {NOTIFICATION_CATEGORIES.map((c) => (
          <Toggle
            key={c}
            label={t(`notifySettings.${c}`)}
            hint={t(`notifySettings.${c}Hint`)}
            value={!prefs.off.includes(c)}
            onChange={(v) => setOn(c, v)}
          />
        ))}
        <Text style={type.small}>{t('notifySettings.safety')}</Text>
        <RadioPrefsSection />

        <Toggle label={t('notifySettings.quiet')} hint={t('notifySettings.quietHint')} value={!!quiet} onChange={(v) => setQuiet(v ? {} : null)} />
        {quiet ? (
          <>
            <Text style={styles.label}>{t('notifySettings.from')}</Text>
            <View style={styles.chips}>
              {STARTS.map((s) => (
                <Chip key={s} label={s} selected={quiet.start === s} onPress={() => setQuiet({ start: s })} />
              ))}
            </View>
            <Text style={styles.label}>{t('notifySettings.until')}</Text>
            <View style={styles.chips}>
              {ENDS.map((e) => (
                <Chip key={e} label={e} selected={quiet.end === e} onPress={() => setQuiet({ end: e })} />
              ))}
            </View>
            <Text style={type.small}>{quiet.timeZone}</Text>
          </>
        ) : null}
        <ErrorText error={error} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  label: { ...type.body, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
