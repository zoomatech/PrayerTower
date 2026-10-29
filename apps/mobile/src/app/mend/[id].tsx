// Mend (docs/GENTLE_REPAIR.md). The author of a comment that hurt someone may write
// a short sorry in three parts; a moderator reads it first. The hurt person reads it
// once delivered and can accept it or close it quietly. Neither side is pressed.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, type Mend } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function MendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const [m, setM] = useState<Mend | null>(null);
  const [whatIDid, setWhatIDid] = useState('');
  const [onMe, setOnMe] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (x: Mend) => {
    setM(x);
    if (x.sorry) {
      setWhatIDid(x.sorry.whatIDid);
      setOnMe(x.sorry.onMe);
      setNextTime(x.sorry.nextTime);
    }
  };
  const load = useCallback(() => {
    api.mend(id).then((r) => show(r.mend), (e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<{ mend: Mend }>) => {
    setBusy(true);
    setError(null);
    try {
      show((await fn()).mend);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sorry = m?.sorry ? (
    <View style={styles.sorry}>
      <Text style={type.body}>{m.sorry.whatIDid}</Text>
      <Text style={type.body}>{m.sorry.onMe}</Text>
      <Text style={type.body}>{m.sorry.nextTime}</Text>
    </View>
  ) : null;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('repair.mendTitle')}</Text>
        <ErrorText error={error} onRetry={m ? undefined : load} />
        {!m && !error ? <Loading /> : null}
        {m?.role === 'author' ? (
          <>
            <Text style={type.body}>{t('repair.authorIntro')}</Text>
            <Text style={type.small}>{t('repair.yourComment')}</Text>
            <Text style={[type.body, styles.quote]}>“{m.comment.body}”</Text>
            {m.canRevise ? (
              <>
                {m.status === 'returned' ? <Text style={type.small}>{t('repair.returned')} {m.moderatorNote ?? ''}</Text> : null}
                <Field label={t('repair.whatIDid')} placeholder={t('repair.whatIDidHint')} value={whatIDid} onChangeText={setWhatIDid} multiline maxLength={600} />
                <Field label={t('repair.onMe')} placeholder={t('repair.onMeHint')} value={onMe} onChangeText={setOnMe} multiline maxLength={600} />
                <Field label={t('repair.nextTime')} value={nextTime} onChangeText={setNextTime} multiline maxLength={600} />
                <Button
                  label={t('repair.send')}
                  busy={busy}
                  disabled={!whatIDid.trim() || !onMe.trim() || !nextTime.trim()}
                  onPress={() => run(() => api.writeSorry(m.id, { whatIDid: whatIDid.trim(), onMe: onMe.trim(), nextTime: nextTime.trim() }))}
                />
              </>
            ) : (
              <>
                {sorry}
                <Text style={type.small}>
                  {m.status === 'review'
                    ? t('repair.inReview')
                    : m.status === 'delivered'
                      ? t('repair.deliveredToThem')
                      : m.status === 'accepted'
                        ? t('repair.acceptedByThem')
                        : t('repair.closedNote')}
                </Text>
              </>
            )}
          </>
        ) : null}
        {m?.role === 'hurt' ? (
          <>
            {m.sorry ? (
              <>
                <Text style={type.heading}>{t('repair.hurtFrom', { name: m.author?.displayName ?? '' })}</Text>
                {sorry}
              </>
            ) : (
              <Text style={type.body}>{t('repair.hurtWaiting')}</Text>
            )}
            {m.status === 'delivered' ? (
              <View style={styles.row}>
                <Button label={t('repair.accept')} busy={busy} onPress={() => run(() => api.acceptMend(m.id))} />
                <Button variant="secondary" label={t('repair.closeQuietly')} onPress={() => run(() => api.closeMend(m.id))} />
              </View>
            ) : ['invited', 'review', 'returned'].includes(m.status) ? (
              <Button variant="ghost" label={t('repair.withdraw')} onPress={() => run(() => api.closeMend(m.id))} />
            ) : (
              <Text style={type.small}>{m.status === 'accepted' ? t('repair.hurtAccepted') : t('repair.hurtClosed')}</Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  quote: { fontStyle: 'italic', color: colors.textMuted },
  sorry: { gap: space.sm, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
