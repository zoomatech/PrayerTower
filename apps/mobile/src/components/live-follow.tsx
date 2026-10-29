// "Show on my Lock Screen" for the member's own open request (iOS Live Activity,
// docs/GROWTH.md): it shows how many people prayed, and first names, for up to 8 hours.
import type { Card } from '@prayer-tower/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { endLive, liveFor, liveSupported, startLive } from '@/lib/prayed-for-live';
import { space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

export function LiveFollow({ card }: { card: Card }) {
  const { t } = useLocale();
  const { prayedForLive } = useFeatures();
  const on = prayedForLive && card.isMine && card.postType === 'prayer_request' && card.state !== 'answered' && liveSupported();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    liveFor(card.id).then((a) => setRunning(!!a), () => undefined);
  }, [on, card.id]);
  if (!on) return null;
  const start = () =>
    startLive(card.id, { heading: t('growth.liveHeading'), line: t('growth.liveWaiting'), count: 0 }).then(
      (ok) => (setRunning(ok), setError(null)),
      (e) => setError(errorText(e)),
    );
  const stop = () => endLive(card.id).then(() => setRunning(false), (e) => setError(errorText(e)));
  return (
    <View style={styles.box}>
      {running ? (
        <Button small variant="ghost" label={t('growth.liveStop')} onPress={stop} />
      ) : (
        <>
          <Button small variant="secondary" label={t('growth.liveStart')} onPress={start} />
          <Text style={type.small}>{t('growth.liveHint')}</Text>
        </>
      )}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: space.sm } });
