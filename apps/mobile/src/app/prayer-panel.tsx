// Prayer panel: the latest prayers that went out, packed into one picture to show or print,
// and reading a panel with the camera or from a picture (components/prayer-panel.tsx). Signed
// out (listener mode) it only reads. Off with the admin's switch.
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { PanelPicture, PanelReader } from '@/components/prayer-panel';
import { Button, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { drawPanel } from '@/lib/burst-listen';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

/** As the station folds a prayer before it goes out (apps/station/src/text.ts foldAscii). */
export function foldAscii(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function PrayerPanelScreen() {
  const t = useT();
  const { session } = useAuth();
  const [latest, setLatest] = useState<{ callSign: string; prayers: string[] } | null>(null);
  useEffect(() => {
    if (session) api.radioPanel().then(setLatest, () => setLatest(null));
  }, [session]);
  const panel = useMemo(() => (latest?.prayers.length ? drawPanel(latest.prayers.map(foldAscii), latest.callSign) : null), [latest]);
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('panel.title')}</Text>
        <Text style={type.body}>{t('panel.intro')}</Text>
        {panel ? (
          <>
            <PanelPicture panel={panel} cell={4} label={t('panel.pictureLabel', { count: panel.count })} />
            <Text style={type.small}>{t('panel.holds', { count: panel.count })}</Text>
            {Platform.OS === 'web' ? <Button variant="secondary" label={t('panel.print')} onPress={() => window.print()} /> : null}
          </>
        ) : null}
        <Text style={type.heading}>{t('panel.readTitle')}</Text>
        <PanelReader />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
});
