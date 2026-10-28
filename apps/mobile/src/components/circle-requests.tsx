// Circle requests for moderators: members who prepared with the facilitator and
// asked for a restorative circle. Schedule the circle in Events, then mark it done.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, type CircleRequest } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

export function CircleRequests() {
  const t = useT();
  const [requests, setRequests] = useState<CircleRequest[]>([]);
  useFocusEffect(
    useCallback(() => {
      api.circleRequests().then((r) => setRequests(r?.requests ?? [])).catch(() => setRequests([]));
    }, []),
  );
  if (!requests.length) return null;
  const close = (id: string) => api.closeCircleRequest(id).then(() => setRequests((prev) => prev.filter((x) => x.id !== id)), () => undefined);
  return (
    <View style={styles.box}>
      <Text style={type.heading}>{t('ai.requests')}</Text>
      {requests.map((r) => (
        <View key={r.id} style={styles.item}>
          <Text style={styles.meta}>
            {r.displayName} · {t(`ai.requestRole.${r.role}`)}
          </Text>
          <Text style={type.body}>{r.summary}</Text>
          <View style={styles.row}>
            <Button small variant="secondary" label={t('ai.schedule')} onPress={() => router.push('/events')} />
            <Button small label={t('ai.close')} onPress={() => close(r.id)} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm },
  meta: { ...type.small, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
