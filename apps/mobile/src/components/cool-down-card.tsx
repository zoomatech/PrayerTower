// Cool-down (docs/GROWTH_PRACTICES.md): after three heated replies between the same two
// members, both see this pause card above the composer. It never stops anyone writing;
// either button just puts it away. "What would Ted Lasso do?" Offer a breather.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { announce } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

/** `nudge` changes when a send says a cool-down is waiting, so the card checks again. */
export function CoolDownCard({ nudge = 0 }: { nudge?: number }) {
  const { coolDown } = useFeatures();
  const t = useT();
  const [offer, setOffer] = useState<{ id: string; line: number } | null>(null);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (!coolDown) return;
    let live = true;
    api.coolDown().then(
      (r) => {
        if (!live) return;
        setOffer(r.coolDown);
        if (r.coolDown && nudge) announce(t(`coolDown.lines.l${r.coolDown.line}`));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [coolDown, nudge, t]);

  if (!coolDown) return null;
  if (thanks) return <Text style={type.small}>{t('coolDown.thanks')}</Text>;
  if (!offer) return null;

  const done = (choice: 'breather' | 'okay') => {
    setOffer(null);
    api.coolDownDone(offer.id, choice).catch(() => undefined);
    if (choice === 'breather') {
      setThanks(true);
      announce(t('coolDown.thanks'));
      if (router.canGoBack()) router.back();
    }
  };

  return (
    <View style={styles.card} testID="cool-down-card" role="alert">
      <Text style={type.heading}>{t('coolDown.title')}</Text>
      <Text style={type.body}>{t(`coolDown.lines.l${offer.line}`)}</Text>
      <View style={styles.row}>
        <Button small label={t('coolDown.breather')} onPress={() => done('breather')} />
        <Button small variant="secondary" label={t('coolDown.okay')} onPress={() => done('okay')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, padding: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
