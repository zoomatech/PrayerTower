// Emoji meanings on a card's single row of action icons (docs/CONVERSATION_HELPERS.md),
// so every feed skin gets them: they all draw cards with PostCard. The row stays the same
// one row of icons (Steve, 2026-10-29). Each action that has a matching emoji (pray, care,
// encourage, strength) shows that emoji's meanings in its hover tip, and pressing and
// holding it opens up to five meanings in a sheet. A plain tap still does the action.
// Needs Emoji meanings and "Meanings in the icon row" switched on.
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTalkCount } from '@/components/reply-helpers';
import { api, type MeaningEmoji } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { announce, useReducedMotion } from '@/lib/motion';
import { moveOf } from '@/lib/talk';
import { colors, radius, space, type } from '@/lib/theme';

// The tree is the same for every card: fetch it once per session.
let treeOnce: Promise<MeaningEmoji[]> | null = null;
function useMeaningTree(on: boolean) {
  const [tree, setTree] = useState<MeaningEmoji[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    treeOnce ??= api.reactionMeanings().then(
      (r) => r.emoji,
      () => {
        treeOnce = null;
        return [];
      },
    );
    treeOnce.then((t) => live && setTree(t));
    return () => {
      live = false;
    };
  }, [on]);
  return tree;
}

/** Forget the cached tree (tests, sign-out). */
export function resetMeaningTree() {
  treeOnce = null;
}

/** Which emoji's meanings each action carries. Actions without one keep just their name. */
export const ACTION_EMOJI: Partial<Record<string, string>> = { praying_now: 'praying', well_wishes: 'love', encouragement: 'support', commit: 'strength' };

export interface MeaningChooser {
  /** The emoji an action carries, when the switches are on and the tree has it. */
  forAction: (action: string) => MeaningEmoji | null;
  /** Its meanings as words, for the hover tip. */
  words: (e: MeaningEmoji) => string;
  open: (e: MeaningEmoji) => void;
  /** The sheet; render it once beside the row. */
  sheet: ReactNode;
}

/** Meanings for one card's action row. Off (forAction always null) unless both switches are on. */
export function useMeaningChooser(postId: string, postBody: string | undefined, enabled = true): MeaningChooser {
  const { meaningReactions, meaningIconRow } = useFeatures();
  const { t, wording } = useLocale();
  const reduced = useReducedMotion();
  const count = useTalkCount();
  const on = enabled && meaningReactions && meaningIconRow;
  const tree = useMeaningTree(on);
  const [open, setOpen] = useState<MeaningEmoji | null>(null);
  const [mine, setMine] = useState<Record<string, string>>({});
  const word = (m: { label: string; neutralLabel: string }) => (wording === 'neutral' ? m.neutralLabel : m.label);

  const choose = (e: MeaningEmoji, key: string) => {
    setOpen(null);
    const m = e.meanings.find((x) => x.key === key)!;
    api.chooseMeaning(postId, e.key, key).then(
      () => {
        setMine((s) => ({ ...s, [e.key]: key }));
        announce(t('meanings.added', { emoji: e.emoji, word: word(m) }));
        count({ kind: 'emoji', emoji: e.key, meaning: key, toMove: moveOf(postBody) ?? 'other' });
      },
      () => announce(t('meanings.failed')),
    );
  };

  const sheet = on ? (
    <Modal visible={!!open} transparent animationType={reduced ? 'none' : 'fade'} onRequestClose={() => setOpen(null)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(null)} accessibilityLabel={t('meanings.close')} accessibilityRole="button">
        {open ? (
          <View style={styles.sheet} role="group" aria-label={t('meanings.choose', { emoji: open.emoji })} onStartShouldSetResponder={() => true}>
            <Text style={type.heading}>{t('meanings.choose', { emoji: open.emoji })}</Text>
            {open.meanings.slice(0, 5).map((m) => (
              <Pressable
                key={m.key}
                testID={`row-meaning-${postId}-${open.key}-${m.key}`}
                accessibilityRole="button"
                accessibilityLabel={`${open.emoji} ${word(m)}`}
                accessibilityState={{ selected: mine[open.key] === m.key }}
                onPress={() => choose(open, m.key)}
                style={[styles.choice, mine[open.key] === m.key && styles.choiceMine]}>
                <Text style={type.body}>
                  {open.emoji} {word(m)}
                </Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setOpen(null)} style={styles.choice}>
              <Text style={type.small}>{t('meanings.close')}</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  ) : null;

  return {
    forAction: (action) => (on ? (tree.find((e) => e.key === ACTION_EMOJI[action]) ?? null) : null),
    words: (e) => `${e.emoji} ${e.meanings.slice(0, 5).map(word).join(' · ')}`,
    open: setOpen,
    sheet,
  };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { gap: space.sm, padding: space.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  choiceMine: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
