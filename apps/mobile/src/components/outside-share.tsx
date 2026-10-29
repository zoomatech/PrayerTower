// Sharing outside the app only with the author's consent (docs/GROWTH.md). With the
// switch off, the old share button stays as it was. With it on, the author picks who
// may share their post (ShareChoice), and everyone else's share button sends only
// what the author allowed (OutsideShareButton): nothing, a members-only link, or a card.
import type { Card } from '@prayer-tower/shared';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Button, Chip, ErrorText } from '@/components/ui';
import { api, type ShareLevel, type ShareState } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { shareLink } from '@/lib/links';
import { space, type } from '@/lib/theme';

function useShareState(postId: string, on: boolean) {
  const [state, setState] = useState<ShareState | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    Promise.resolve()
      .then(() => api.shareState(postId))
      .then((r) => live && setState(r.share), () => undefined);
    return () => {
      live = false;
    };
  }, [postId, on]);
  return [state, setState] as const;
}

/** The "Share outside" button in the card's share sheet. */
export function OutsideShareButton({ card }: { card: Card }) {
  const { t } = useLocale();
  const { shareConsent } = useFeatures();
  const [state] = useShareState(card.id, shareConsent);
  const send = (path: string, words: boolean) => {
    const url = shareLink(path as `/${string}`);
    const message = words ? t('actions.shareMessage', { preview: card.preview, url }) : t('growth.shareLinkMessage', { url });
    return Share.share({ message }).catch(() => undefined);
  };
  if (!shareConsent) return <Button variant="ghost" label={t('actions.shareOutside')} onPress={() => send(`/post/${card.id}`, true)} />;
  if (!state) return null;
  if (!state.canShare) return <Text style={type.small}>{t('growth.shareKeptPrivate')}</Text>;
  return <Button variant="ghost" label={t('actions.shareOutside')} onPress={() => send(state.path, state.words)} />;
}

/** On the author's own post: who may share it outside the app. */
export function ShareChoice({ card }: { card: Card }) {
  const { t } = useLocale();
  const { shareConsent } = useFeatures();
  const on = shareConsent && card.isMine;
  const [state, setState] = useShareState(card.id, on);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!on || !state) return null;
  const choose = (level: ShareLevel) =>
    api.setShareLevel(card.id, level).then(
      (r) => {
        setState(r.share);
        setError(null);
        setNote(t('growth.shareSaved'));
      },
      (e) => setError((e as Error).message),
    );
  const levels: [ShareLevel, string][] = [
    ['private', t('growth.sharePrivate')],
    ['link', t('growth.shareLink')],
    ...(state.cardAllowed ? ([['card', t('growth.shareCard')]] as [ShareLevel, string][]) : []),
  ];
  return (
    <View style={styles.box}>
      <Text style={type.heading} role="heading">
        {t('growth.shareChoice')}
      </Text>
      <Text style={type.small}>{t('growth.shareChoiceHint')}</Text>
      <View style={styles.row} role="radiogroup" aria-label={t('growth.shareChoice')}>
        {levels.map(([level, label]) => (
          <Chip key={level} radio label={label} selected={state.level === level} onPress={() => choose(level)} />
        ))}
      </View>
      {state.level === 'link' ? <Text style={type.small}>{t('growth.shareLinkHint')}</Text> : null}
      {state.level === 'card' ? <Text style={type.small}>{t('growth.shareCardHint')}</Text> : null}
      {!state.cardAllowed ? <Text style={type.small}>{t('growth.shareCardCrisis')}</Text> : null}
      {note ? <Text style={type.small}>{note}</Text> : null}
      <ErrorText error={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
