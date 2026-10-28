// Live video for staff: start a room (a new room on the video server, or a
// pasted meeting link) and end it. Members see open rooms under "Live now".
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/ui';
import { api, type LiveRoom } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export default function Live() {
  const t = useT();
  const [state, setState] = useState<Awaited<ReturnType<typeof api.liveNow>> | null>(null);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api.liveNow().then(setState).catch((e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.startLive(title.trim(), link.trim() || undefined);
      setTitle('');
      setLink('');
      load();
      await WebBrowser.openBrowserAsync(r.roomUrl);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const end = (r: LiveRoom) => api.endLive(r.id).then(load, (e) => setError((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('live.title')}</Text>
        <Text style={type.body}>{t('live.intro')}</Text>
        {state?.canHost ? (
          <>
            <Field label={t('live.roomTitle')} placeholder={t('live.roomTitlePlaceholder')} value={title} onChangeText={setTitle} maxLength={120} />
            <Field label={t('live.link')} value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" maxLength={500} />
            <Text style={type.small}>{state.canCreateRoom ? t('live.linkHint') : t('live.linkNeeded')}</Text>
            <Button label={t('live.start')} onPress={start} busy={busy} disabled={!title.trim() || (!state.canCreateRoom && !link.trim())} />
          </>
        ) : null}
        <ErrorText error={error} />
        {state?.rooms.map((r) => (
          <View key={r.id} style={styles.room}>
            <View style={styles.text}>
              <Text style={type.body}>{r.title}</Text>
              <Text style={type.small}>{t('live.by', { name: r.hostName })}</Text>
            </View>
            <Button small label={t('live.join')} onPress={() => WebBrowser.openBrowserAsync(r.roomUrl).catch(() => undefined)} />
            {r.isMine ? <Button small variant="secondary" label={t('live.end')} onPress={() => end(r)} /> : null}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 80 },
  room: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  text: { flex: 1, gap: 2 },
});
