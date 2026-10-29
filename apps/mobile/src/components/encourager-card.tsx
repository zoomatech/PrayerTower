// Encourager (docs/GROWTH_PRACTICES.md): a newcomer can ask for one welcoming
// volunteer for their first weeks, like Wikipedia's Teahouse. Either side ends it
// with one tap and no reason; it ends on its own. No streaks, no "they're waiting".
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Toggle } from '@/components/ui';
import { api, type EncouragerState } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

export function EncouragerCard() {
  const { encourager } = useFeatures();
  const t = useT();
  const [s, setS] = useState<EncouragerState | null>(null);
  const [agree, setAgree] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!encourager) return;
    // A card that can't load stays hidden; only the error log hears about it.
    api.encourager().then(setS).catch((e) => void errorText(e));
  }, [encourager]);

  if (!encourager || !s?.enabled) return null;

  const run = async (fn: () => Promise<EncouragerState>) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const next = await fn();
      setS(next);
      if (next.enabled && next.matched === false) setNote(t('practices.encNone'));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="encourager-card">
      <Text style={type.heading}>{t('practices.encTitle')}</Text>
      {s.matches.map((m) => (
        <View key={m.id} style={styles.match}>
          <Text style={type.body} onPress={() => router.push(`/people/${m.other.id}`)}>
            {m.role === 'newcomer' ? t('practices.encYours', { name: m.other.displayName }) : t('practices.encYouEncourage', { name: m.other.displayName })}
          </Text>
          <Text style={type.small}>{t(m.role === 'newcomer' ? 'practices.encYoursHint' : 'practices.encYouEncourageHint', { date: day(m.endsAt) })}</Text>
          {m.checkInDue ? (
            <View style={styles.checkIn} role="group" aria-label={t('encCheck.title')} testID={`encourager-checkin-${m.id}`}>
              <Text style={type.body}>{t('encCheck.title')}</Text>
              <Text style={type.small}>{t('encCheck.hint')}</Text>
              <View style={styles.row}>
                {(['good', 'okay', 'change'] as const).map((a) => (
                  <Button
                    key={a}
                    small
                    variant="secondary"
                    label={t(`encCheck.${a}`)}
                    onPress={() =>
                      run(async () => {
                        const next = await api.encouragerCheckIn(m.id, a);
                        announce(t(a === 'change' ? 'encCheck.changed' : 'encCheck.thanks'));
                        return next;
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Button small variant="ghost" label={t('practices.encEnd')} testID={`encourager-end-${m.id}`} onPress={() => run(() => api.endEncouragerMatch(m.id))} />
        </View>
      ))}
      {s.canAsk ? (
        <>
          <Text style={type.small}>{t('practices.encNewcomerIntro')}</Text>
          <Button small label={t('practices.encAsk')} busy={busy} onPress={() => run(() => api.askForEncourager())} />
        </>
      ) : null}
      {s.volunteer ? (
        <>
          <Text style={type.small}>{t('practices.encVolunteering')}</Text>
          <Button small variant="secondary" label={t('practices.encStop')} onPress={() => run(() => api.setVolunteer(false))} />
        </>
      ) : (
        <>
          <Text style={type.small}>{t('practices.encVolunteerIntro')}</Text>
          <Toggle label={t('practices.encVolunteerAgree')} value={agree} onChange={setAgree} />
          <Button small variant="secondary" label={t('practices.encVolunteer')} disabled={!agree} onPress={() => run(() => api.setVolunteer(true, true))} />
        </>
      )}
      {note ? <Text style={type.small}>{note}</Text> : null}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  match: { gap: space.xs },
  checkIn: { gap: space.xs, padding: space.sm, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
