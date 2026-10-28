// The Annual Prayer Warrior Award on Me (off unless an admin turns it on): accept
// or decline an offer, and choose whether the Hall shows your name.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Toggle } from '@/components/ui';
import { api, type MyAwards } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export function AwardCard() {
  const { t } = useLocale();
  const [data, setData] = useState<MyAwards | null>(null);
  const [showName, setShowName] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    api.myAwards().then(setData).catch(() => setData(null));
  }, []);
  useFocusEffect(load);
  if (!data?.enabled || !data.awards?.length) return null;
  const fail = (e: unknown) => setNote((e as Error).message);
  return (
    <View style={styles.card} role="group" aria-label={t('award.heading')}>
      {data.awards.map((a) =>
        a.status === 'offered' ? (
          <View key={a.id} style={styles.item}>
            <Text style={type.heading}>{t('award.offer', { year: a.year })}</Text>
            <Text style={type.body}>{t('award.why', { count: a.prayers + a.checkins, people: a.peoplePrayedFor })}</Text>
            {data.prize.tokens || data.prize.priestly ? <Text style={type.small}>{t('award.prize', { tokens: data.prize.tokens, special: data.prize.priestly })}</Text> : null}
            {data.prize.note ? <Text style={type.small}>{data.prize.note}</Text> : null}
            {data.publicHall ? <Toggle label={t('award.showName')} hint={t('award.showNameHint')} value={showName} onChange={setShowName} /> : null}
            <View style={styles.row}>
              <Button label={t('award.accept')} onPress={() => api.acceptAward(a.id, data.publicHall && showName).then(() => { setNote(t('award.thanks')); load(); }, fail)} />
              <Button variant="ghost" label={t('award.decline')} onPress={() => api.declineAward(a.id).then(load, fail)} />
            </View>
          </View>
        ) : a.status === 'accepted' ? (
          <Text key={a.id} style={type.body}>
            {t('award.won', { year: a.year })}
          </Text>
        ) : null,
      )}
      {data.publicHall ? <Button small variant="ghost" label={t('award.hall')} onPress={() => router.push('/awards')} /> : null}
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  item: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
