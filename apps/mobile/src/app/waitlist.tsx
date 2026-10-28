// Admin → Waitlist: people who left an email on the public /waitlist page.
// "Invite" makes a one-use invite code for their edition; send it from Invite codes.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api, type WaitlistEntry } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

function Waitlist() {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(true);
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.waitlist();
      setEnabled(r.enabled);
      setEntries(r.entries);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('waitlist.title')}</Text>
        <Text style={type.body}>{t('waitlist.intro')}</Text>
        {!enabled ? <Text style={styles.notice}>{t('waitlist.off')}</Text> : null}
        <ErrorText error={error} />
        {entries.length === 0 && !error ? <Empty text={t('waitlist.empty')} /> : null}
        {entries.map((e) => (
          <View key={e.id} style={styles.card}>
            <Text style={styles.cardTitle} selectable>
              {e.email}
            </Text>
            {e.name ? <Text style={type.body}>{e.name}</Text> : null}
            {e.note ? <Text style={type.small}>{e.note}</Text> : null}
            <Text style={type.small}>
              {t(e.edition === 'open-circle' ? 'waitlist.openCircle' : 'waitlist.prayerTower')} · {new Date(e.createdAt).toLocaleDateString()}
            </Text>
            {e.inviteCode ? (
              <Text style={type.body} selectable>
                {t('waitlist.invited', { code: e.inviteCode })}
              </Text>
            ) : (
              <View style={styles.row}>
                <Button small label={t('waitlist.invite')} disabled={busy} onPress={() => run(() => api.admin.inviteFromWaitlist(e.id))} />
                <Button small variant="ghost" label={t('waitlist.remove')} disabled={busy} onPress={() => run(() => api.admin.removeFromWaitlist(e.id))} />
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  card: { borderWidth: 1, borderRadius: radius.md, borderColor: colors.border, padding: space.md, gap: space.sm },
  cardTitle: { ...type.body, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  notice: { ...type.small, backgroundColor: colors.primarySoft, padding: space.sm, borderRadius: radius.md },
});

export default staffOnly(Waitlist, ['admin']);
