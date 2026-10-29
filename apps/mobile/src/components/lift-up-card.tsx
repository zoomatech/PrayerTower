// "Who did you lift up this week?" (docs/GROWTH_PRACTICES.md): a private weekly
// reflection on Me. Noticing your own kindness helps you repeat it (research/
// Personal_Growth_Research.md). No reminders, no counts, and no missed weeks.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '@/components/ui';
import { api, type LiftUp } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function LiftUpCard() {
  const { liftUp } = useFeatures();
  const t = useT();
  const [l, setL] = useState<LiftUp | null>(null);
  const [body, setBody] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!liftUp) return;
    api.liftUp(zone()).then(
      (x) => {
        setL(x);
        if (x.enabled) setBody(x.body);
      },
      // A card that can't load stays hidden; only the error log hears about it.
      (e) => void errorText(e),
    );
  }, [liftUp]);

  if (!liftUp || !l?.enabled) return null;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      setL(await api.saveLiftUp(body.trim(), zone()));
      setNote(body.trim() ? t('practices.liftUpSaved') : null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.card} testID="lift-up-card">
      <Text style={type.heading} role="heading">
        {t('practices.liftUpTitle')}
      </Text>
      <Text style={type.small}>{t('practices.liftUpIntro')}</Text>
      <Field label={t('practices.liftUpLabel')} value={body} maxLength={280} multiline onChangeText={setBody} />
      <Button small label={t('practices.liftUpSave')} busy={busy} onPress={save} />
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
});
