// Conversation helpers under a composer (docs/CONVERSATION_HELPERS.md): one reply
// that fits the moment, a gentle question after a downbeat answer, a greeting from
// another tradition to open with, and kind closings. A tap only fills the box; the
// member always edits and sends it themselves. Each needs its Admin switch on and
// the member's own choice on Me.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui';
import { api, type ConversationPrefs } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { CLOSING_KEYS, isDownbeat, suggestionKey } from '@/lib/talk';
import { colors, space, type } from '@/lib/theme';

let cached: Promise<ConversationPrefs> | null = null;
/** The member's choices, fetched once per session while any helper is switched on; off if they can't load. */
export function useConversationPrefs(): [ConversationPrefs | null, (p: ConversationPrefs) => void] {
  const f = useFeatures();
  const anyOn = f.replySuggestions || f.troubleNudge || f.kindClosings || f.greetingPacks || f.ownWords || f.meaningPrefs;
  const [prefs, setPrefs] = useState<ConversationPrefs | null>(null);
  useEffect(() => {
    if (!anyOn) return;
    let live = true;
    cached ??= api.conversationPrefs().then(
      (r) => r.prefs,
      () => {
        cached = null;
        return { replySuggestions: false, troubleNudge: false, kindClosings: false, greetingPack: null };
      },
    );
    cached.then((p) => live && setPrefs(p));
    return () => {
      live = false;
    };
  }, [anyOn]);
  const update = (p: ConversationPrefs) => {
    cached = Promise.resolve(p);
    setPrefs(p);
  };
  return [prefs, update];
}

/** Forget the cached choices (tests, sign-out). */
export function resetConversationPrefs() {
  cached = null;
}

export function ReplyHelpers({ lastFromOther, empty, text, onPick }: { lastFromOther: string | null; empty: boolean; text: string; onPick: (text: string) => void }) {
  const f = useFeatures();
  const t = useT();
  const [prefs] = useConversationPrefs();
  const [picked, setPicked] = useState<string | null>(null);
  if (!prefs) return null;

  const chips: { label: string; hint?: string }[] = [];
  if (f.replySuggestions && prefs.replySuggestions) {
    const key = suggestionKey(lastFromOther, empty);
    if (key) chips.push({ label: t(key) });
  }
  if (f.greetingPacks && prefs.greetingPack && empty) {
    const pack = prefs.greetingPack;
    chips.push({ label: t(`talk.packs.${pack}.greeting`), hint: t('talk.packNote', { pack: t(`talk.packs.${pack}.name`), note: t(`talk.packs.${pack}.note`) }) });
  }
  if (f.troubleNudge && prefs.troubleNudge && isDownbeat(lastFromOther)) chips.push({ label: t('talk.careAsk') });
  if (f.kindClosings && prefs.kindClosings && !empty) for (const k of CLOSING_KEYS) chips.push({ label: t(k) });

  const ownWords = f.ownWords && picked !== null && text === picked;
  if (!chips.length && !ownWords) return null;
  const pick = (s: string) => {
    setPicked(s);
    onPick(s);
  };
  return (
    <View style={styles.wrap} testID="reply-helpers">
      {chips.length ? (
        <View style={styles.row} role="group" aria-label={t('talk.suggested')}>
          {chips.map((c) => (
            <Chip key={c.label} label={c.label} selected={false} onPress={() => pick(c.label)} />
          ))}
        </View>
      ) : null}
      {chips.filter((c) => c.hint).map((c) => (
        <Text key={`${c.label}-hint`} style={type.small}>
          {c.hint}
        </Text>
      ))}
      {ownWords ? <Text style={[type.small, styles.own]}>{t('talk.ownWords')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  own: { color: colors.primary, fontStyle: 'italic' },
});
