// Emoji meanings in a card's single icon row (docs/CONVERSATION_HELPERS.md), so every
// feed skin gets them: they all draw cards with PostCard. A tap adds the emoji's first
// meaning; pressing and holding opens up to five meanings; hovering (iPad pointer, Mac,
// web) shows the words. Needs Emoji meanings and "Meanings in the icon row" switched on.
import { useEffect, useState } from 'react';
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

/** Emoji icons that sit in the card's icon row, after the actions. */
export function MeaningIcons({ postId, postBody }: { postId: string; postBody?: string }) {
  const { meaningReactions, meaningIconRow } = useFeatures();
  const { t, wording } = useLocale();
  const reduced = useReducedMotion();
  const count = useTalkCount();
  const tree = useMeaningTree(meaningReactions && meaningIconRow);
  const [open, setOpen] = useState<MeaningEmoji | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [mine, setMine] = useState<Record<string, string>>({});
  if (!meaningReactions || !meaningIconRow || !tree.length) return null;
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

  return (
    <>
      {tree.map((e) => {
        const chosen = mine[e.key] ? e.meanings.find((m) => m.key === mine[e.key]) : null;
        const first = e.meanings[0]!;
        return (
          <View key={e.key} style={styles.cell}>
            {tip === e.key ? (
              <View style={styles.tip} pointerEvents="none">
                <Text style={styles.tipText} numberOfLines={2}>
                  {e.meanings.map(word).join(' · ')}
                </Text>
              </View>
            ) : null}
            <Pressable
              testID={`row-meaning-${postId}-${e.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${e.emoji} ${word(chosen ?? first)}`}
              accessibilityHint={t('meanings.hint')}
              accessibilityState={{ selected: !!chosen }}
              accessibilityActions={[{ name: 'longpress', label: t('meanings.choose', { emoji: e.emoji }) }]}
              onAccessibilityAction={() => setOpen(e)}
              onPress={() => choose(e, first.key)}
              onLongPress={() => setOpen(e)}
              delayLongPress={350}
              onHoverIn={() => setTip(e.key)}
              onHoverOut={() => setTip(null)}
              hitSlop={4}
              style={({ pressed }) => [styles.icon, chosen && styles.iconMine, pressed && { opacity: 0.6 }]}>
              <Text style={styles.emoji} maxFontSizeMultiplier={2}>
                {e.emoji}
              </Text>
            </Pressable>
          </View>
        );
      })}
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
                  style={[styles.choice, mine[open.key] === m.key && styles.iconMine]}>
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
    </>
  );
}

const styles = StyleSheet.create({
  cell: { position: 'relative' },
  icon: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  iconMine: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  emoji: { fontSize: 18 },
  tip: { position: 'absolute', bottom: 48, left: -40, width: 160, padding: space.xs, borderRadius: radius.md, backgroundColor: colors.text, zIndex: 10 },
  tipText: { ...type.small, color: colors.surface, textAlign: 'center' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { gap: space.sm, padding: space.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, backgroundColor: colors.surface },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
});
