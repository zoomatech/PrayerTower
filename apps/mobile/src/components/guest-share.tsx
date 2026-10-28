// Growth ideas on the asker's own request (docs/GROWTH.md): a web link anyone
// can pray from without an account, and sending it to the asker's email
// prayer chain. Hidden while an admin has them switched off.
import type { Card } from '@prayer-tower/shared';
import { useCallback, useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText } from '@/components/ui';
import { api, type GuestLink } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { shareLink } from '@/lib/links';
import { space, type } from '@/lib/theme';

export function GuestShare({ card }: { card: Card }) {
  const { t } = useLocale();
  const features = useFeatures();
  const [link, setLink] = useState<GuestLink | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const on = features.guestPrayer && card.isMine && card.postType === 'prayer_request' && card.state !== 'answered';

  const load = useCallback(() => {
    api.guestLink(card.id).then((r) => setLink(r.link), () => undefined);
  }, [card.id]);
  useEffect(() => {
    if (on) load();
  }, [on, load]);
  if (!on) return null;

  const share = (l: GuestLink) =>
    Share.share({ message: t('growth.guestShareMessage', { preview: card.preview || card.body, url: shareLink(l.path as `/${string}`) }) }).catch(() => undefined);
  const create = () =>
    api.createGuestLink(card.id).then(
      (r) => {
        setLink(r.link);
        setError(null);
        return share(r.link);
      },
      (e) => setError((e as Error).message),
    );
  const stop = () =>
    api.revokeGuestLink(card.id).then(
      () => {
        setLink(null);
        setNote(t('growth.guestStopped'));
      },
      (e) => setError((e as Error).message),
    );
  const toChain = () =>
    api.sendToPrayerChain(card.id).then(
      (r) => {
        setNote(t('growth.chainSent', { count: r.recipients }));
        load();
      },
      (e) => setError((e as Error).message),
    );

  return (
    <View style={styles.box}>
      {link ? (
        <>
          {link.guestPrayers > 0 ? (
            <Text style={type.body}>{link.guestPrayers === 1 ? t('growth.guestCountOne') : t('growth.guestCount', { count: link.guestPrayers })}</Text>
          ) : null}
          <View style={styles.row}>
            <Button small variant="secondary" label={t('growth.guestShareAgain')} onPress={() => share(link)} />
            <Button small variant="ghost" label={t('growth.guestStop')} onPress={stop} />
          </View>
        </>
      ) : (
        <>
          <Button variant="secondary" label={t('growth.guestShare')} onPress={create} />
          <Text style={type.small}>{t('growth.guestShareHint')}</Text>
        </>
      )}
      {features.prayerChain ? <Button small variant="secondary" label={t('growth.chainSend')} onPress={toChain} /> : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
