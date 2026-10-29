// Emoji reactions that say something (Steve, 2026-10-29). A tap on an emoji adds its
// first meaning as a leaf on the post ("💪 Feel better"); pressing and holding opens
// up to five meanings. Open Circle sees the neutral wording. Off until Admin turns on
// "Emoji meanings". Research: research/Emoji_Reaction_Tree_Research.md.
// The leaf's look belongs to the feed themes: pass `tokens` to skin it.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, type MeaningEmoji, type MeaningLeaf } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

/** The part of a feed skin a leaf reads (the Vine skin's tokens fit this shape). */
export type LeafTokens = { leaf?: string; leafSoft?: string; leafShape?: 'round' | 'pointed' };

/** One chosen meaning with how many chose it. Plain chip unless a skin passes tokens. */
export function Leaf({ icon, label, count, mine, tokens, onPress }: { icon: string; label: string; count: number; mine: boolean; tokens?: LeafTokens; onPress?: () => void }) {
  const { t } = useLocale();
  const skinned = tokens?.leaf
    ? { backgroundColor: tokens.leafSoft ?? colors.primarySoft, borderColor: tokens.leaf, ...(tokens.leafShape === 'pointed' ? styles.pointed : null) }
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: mine }}
      accessibilityLabel={`${icon} ${t('meanings.leaf', { label, count })}${mine ? `, ${t('meanings.mine')}` : ''}`}
      onPress={onPress}
      style={[styles.leaf, mine && styles.leafMine, skinned]}>
      <Text>{icon}</Text>
      <Text style={styles.leafLabel}>{label}</Text>
      {count > 1 ? <Text style={type.small}>{count}</Text> : null}
    </Pressable>
  );
}

export function MeaningReactions({ postId, tokens }: { postId: string; tokens?: LeafTokens }) {
  const { meaningReactions } = useFeatures();
  const { t, wording } = useLocale();
  const [tree, setTree] = useState<MeaningEmoji[]>([]);
  const [leaves, setLeaves] = useState<MeaningLeaf[]>([]);
  const [open, setOpen] = useState<MeaningEmoji | null>(null);
  const [error, setError] = useState<string | null>(null);
  const word = useCallback((m: { label: string; neutralLabel: string }) => (wording === 'neutral' ? m.neutralLabel : m.label), [wording]);

  useEffect(() => {
    if (!meaningReactions) return;
    let live = true;
    Promise.all([api.reactionMeanings(), api.meanings(postId)])
      .then(([tr, l]) => {
        if (!live) return;
        setTree(tr.emoji);
        setLeaves(l.leaves);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [meaningReactions, postId]);

  if (!meaningReactions || !tree.length) return null;

  const act = async (fn: () => Promise<{ leaves: MeaningLeaf[] }>) => {
    try {
      setError(null);
      setLeaves((await fn()).leaves);
      setOpen(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const choose = (emoji: string, meaning: string) => act(() => api.chooseMeaning(postId, emoji, meaning));
  const mineFor = (emoji: string) => leaves.find((l) => l.emoji === emoji && l.mine);

  return (
    <View style={styles.wrap}>
      {leaves.length ? (
        <View style={styles.row}>
          {leaves.map((l) => (
            <Leaf
              key={`${l.emoji}-${l.meaning}`}
              icon={l.icon}
              label={word(l)}
              count={l.count}
              mine={l.mine}
              tokens={tokens}
              // Tapping a leaf adds the same word (or takes yours back).
              onPress={() => (l.mine ? act(() => api.removeMeaning(postId, l.emoji)) : choose(l.emoji, l.meaning))}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.row} role="group" aria-label={t('meanings.tray')}>
        {tree.map((e) => (
          <Pressable
            key={e.key}
            testID={`meaning-${e.key}`}
            accessibilityRole="button"
            accessibilityHint={t('meanings.hint')}
            accessibilityLabel={`${e.emoji} ${word(e.meanings[0]!)}`}
            accessibilityActions={[{ name: 'longpress', label: t('meanings.choose', { emoji: e.emoji }) }]}
            onAccessibilityAction={() => setOpen(e)}
            onPress={() => choose(e.key, e.meanings[0]!.key)}
            onLongPress={() => setOpen(e)}
            style={({ pressed }) => [styles.emoji, mineFor(e.key) && styles.leafMine, pressed && { opacity: 0.6 }]}>
            <Text style={styles.emojiText}>{e.emoji}</Text>
          </Pressable>
        ))}
      </View>
      {open ? (
        <View style={styles.tree} role="group" aria-label={t('meanings.choose', { emoji: open.emoji })}>
          {open.meanings.map((m) => {
            const on = mineFor(open.key)?.meaning === m.key;
            return (
              <Pressable
                key={m.key}
                testID={`meaning-${open.key}-${m.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => choose(open.key, m.key)}
                style={[styles.choice, on && styles.leafMine]}>
                <Text style={styles.leafLabel}>
                  {open.emoji} {word(m)}
                </Text>
              </Pressable>
            );
          })}
          {mineFor(open.key) ? (
            <Pressable accessibilityRole="button" onPress={() => act(() => api.removeMeaning(postId, open.key))} style={styles.choice}>
              <Text style={type.small}>{t('meanings.remove')}</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('meanings.close')} onPress={() => setOpen(null)} style={styles.close}>
            <Text style={type.small}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={[type.small, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  leaf: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  // A leaf's outline: two rounded corners, two points.
  pointed: { borderTopLeftRadius: 2, borderBottomRightRadius: 2, borderTopRightRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  leafMine: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  leafLabel: { fontSize: 15, color: colors.text },
  emoji: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  emojiText: { fontSize: 20 },
  tree: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
