// "Live now" above the feed: live video rooms in the member's community. Shows
// nothing while live video is off or no room is open.
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, type LiveRoom } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

import { Button } from './ui';

export function LiveNow() {
  const t = useT();
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  const [canHost, setCanHost] = useState(false);
  useFocusEffect(
    useCallback(() => {
      api
        .liveNow()
        .then((r) => {
          setRooms(r?.rooms ?? []);
          setCanHost(!!r?.canHost);
        })
        .catch(() => setRooms([]));
    }, []),
  );
  if (!rooms.length) return null;
  return (
    <View style={styles.box} accessibilityRole="summary">
      <View style={styles.row}>
        <View style={styles.dot} />
        <Text style={type.heading}>{t('live.now')}</Text>
      </View>
      {rooms.map((r) => (
        <View key={r.id} style={styles.room}>
          <View style={styles.text}>
            <Text style={type.body}>{r.title}</Text>
            <Text style={type.small}>{t('live.by', { name: r.hostName })}</Text>
          </View>
          <Button small label={t('live.join')} onPress={() => WebBrowser.openBrowserAsync(r.roomUrl).catch(() => undefined)} />
        </View>
      ))}
      {canHost ? <Button small variant="ghost" label={t('live.open')} onPress={() => router.push('/live')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger },
  room: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: 2 },
});

/** On Me, for staff who can host: the way in to start a room when none is live. */
export function LiveHostLink() {
  const t = useT();
  const [canHost, setCanHost] = useState(false);
  useFocusEffect(
    useCallback(() => {
      api.liveNow().then((r) => setCanHost(!!r?.enabled && !!r?.canHost)).catch(() => setCanHost(false));
    }, []),
  );
  return canHost ? <Button small variant="secondary" label={t('live.open')} onPress={() => router.push('/live')} /> : null;
}
