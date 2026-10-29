// Encouragement partners (docs/GROWTH_PRACTICES.md): opt-in pairs who check in on
// each other for a few weeks. Either one leaves with one tap and no reason. Nothing
// counts check-ins or mentions a missed day.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText, Field, Toggle } from '@/components/ui';
import { api, type PartnerState } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

type Mood = 'good' | 'okay' | 'hard';
const MOODS: Mood[] = ['good', 'okay', 'hard'];
const KEY: Record<Mood, string> = { good: 'practices.partnerGood', okay: 'practices.partnerOkay', hard: 'practices.partnerHard' };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

export function PartnerCard() {
  const { partners } = useFeatures();
  const t = useT();
  const [s, setS] = useState<PartnerState | null>(null);
  const [agree, setAgree] = useState(false);
  const [mood, setMood] = useState<Mood | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!partners) return;
    // A card that can't load stays hidden; only the error log hears about it.
    api.partner().then(setS, (e) => void errorText(e));
  }, [partners]);

  if (!partners || !s?.enabled) return null;

  const run = async (fn: () => Promise<PartnerState>, done?: string) => {
    setBusy(true);
    setError(null);
    try {
      setS(await fn());
      setNote(done ?? null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card} testID="partner-card">
      <Text style={type.heading} role="heading">
        {t('practices.partnerTitle')}
      </Text>
      {s.status === 'none' ? (
        <>
          <Text style={type.small}>{t('practices.partnerIntro', { days: s.days })}</Text>
          <Toggle label={t('practices.partnerAgree')} value={agree} onChange={setAgree} />
          <Button small label={t('practices.partnerJoin')} busy={busy} disabled={!agree} onPress={() => run(() => api.joinPartners())} />
        </>
      ) : null}
      {s.status === 'waiting' ? (
        <>
          <Text style={type.body}>{t('practices.partnerWaiting')}</Text>
          <Button small variant="ghost" label={t('practices.partnerLeaveWaiting')} onPress={() => run(() => api.leavePartners())} />
        </>
      ) : null}
      {s.status === 'paired' && s.partner ? (
        <>
          <Text style={type.body}>{t('practices.partnerWith', { name: s.partner.displayName })}</Text>
          {s.endsAt ? <Text style={type.small}>{t('practices.partnerUntil', { date: day(s.endsAt) })}</Text> : null}
          {s.canCheckIn ? (
            <>
              <Text style={type.small}>{t('practices.partnerHow')}</Text>
              <View style={styles.row} role="radiogroup" aria-label={t('practices.partnerHow')}>
                {MOODS.map((m) => (
                  <Chip key={m} radio label={t(KEY[m])} selected={mood === m} onPress={() => setMood(m)} />
                ))}
              </View>
              <Field label={t('practices.partnerNote')} value={text} maxLength={280} onChangeText={setText} />
              <Button small label={t('practices.partnerSend')} busy={busy} disabled={!mood} onPress={() => mood && run(() => api.partnerCheckIn(mood, text.trim() || undefined))} />
            </>
          ) : (
            <Text style={type.small}>{t('practices.partnerDone')}</Text>
          )}
          {s.checkins.map((c) => (
            <Text key={c.id} style={type.small}>
              {c.mine ? t('practices.partnerMine') : s.partner!.displayName}: {t(`practices.partnerMood.${c.mood}`)}
              {c.note ? ` · ${c.note}` : ''}
            </Text>
          ))}
          <Button small variant="ghost" label={t('practices.partnerLeave')} onPress={() => run(() => api.leavePartners(), t('practices.partnerEnded'))} />
        </>
      ) : null}
      {note ? (
        <Text style={type.small} aria-live="polite">
          {note}
        </Text>
      ) : null}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
