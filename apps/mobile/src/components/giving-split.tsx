// Giving split (docs/GIVING_SPLIT.md): a member with their own support page may ask that
// a share of gifts toward them go there. The app never holds the money; the giver sends
// that share themselves. Hidden while an admin has it switched off.
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { api, type GivingSplit, type MyGivingSplit } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** What the giver sees: the share the member asks for, and a button to their page. */
export function GivingSplitNote({ split, name }: { split: GivingSplit; name?: string | null }) {
  const { t } = useLocale();
  const who = name || t('givingSplit.someone');
  return (
    <View style={styles.box} testID="giving-split-note">
      <Text style={type.small}>
        {split.shareCents
          ? t('givingSplit.noteAmount', { name: who, percent: split.percent, share: dollars(split.shareCents) })
          : t('givingSplit.note', { name: who, percent: split.percent })}
      </Text>
      <Button small variant="secondary" label={t('givingSplit.open')} onPress={() => WebBrowser.openBrowserAsync(split.url).catch(() => undefined)} />
    </View>
  );
}

/** In the gift sheet on a post: the author's split, never on an anonymous post. */
export function PostGivingSplit({ postId, name }: { postId: string; name?: string | null }) {
  const { givingSplit } = useFeatures();
  const [split, setSplit] = useState<GivingSplit | null>(null);
  useEffect(() => {
    if (!givingSplit) return;
    Promise.resolve()
      .then(() => api.postGivingSplit(postId))
      .then((r) => setSplit(r.split), () => undefined);
  }, [postId, givingSplit]);
  return givingSplit && split ? <GivingSplitNote split={split} name={name} /> : null;
}

/** On Me: the share of gifts the member asks for. */
export function GivingSplitChoice() {
  const { t } = useLocale();
  const { givingSplit } = useFeatures();
  const [mine, setMine] = useState<MyGivingSplit | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!givingSplit) return;
    Promise.resolve()
      .then(() => api.myGivingSplit())
      .then((r) => setMine(r.split), () => undefined);
  }, [givingSplit]);
  if (!givingSplit || !mine) return null;
  const choose = (percent: number) =>
    api.setGivingSplit(percent).then(
      (r) => (setMine(r.split), setNote(t('givingSplit.saved'))),
      (e) => setNote(errorText(e)),
    );
  const options = [0, 10, 20, 30, 40, 50, 75, 100].filter((p) => p <= mine.maxPercent);
  return (
    <View style={styles.box}>
      <Text style={type.heading} role="heading">
        {t('givingSplit.title')}
      </Text>
      <Text style={type.small}>{t('givingSplit.hint')}</Text>
      {mine.supportUrl ? (
        <View style={styles.row} role="radiogroup" aria-label={t('givingSplit.title')}>
          {options.map((p) => (
            <Chip key={p} radio label={p ? t('givingSplit.percent', { percent: p }) : t('givingSplit.none')} selected={mine.percent === p} onPress={() => choose(p)} />
          ))}
        </View>
      ) : (
        <Text style={type.small}>{t('givingSplit.needPage')}</Text>
      )}
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
