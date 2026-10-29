// Emoji reactions that say something (Steve, 2026-10-29). A tap on an emoji adds its
// first meaning as a leaf on the post ("💪 Feel better"); pressing and holding opens
// up to five meanings. Open Circle sees the neutral wording. Off until Admin turns on
// "Emoji meanings". Research: research/Emoji_Reaction_Tree_Research.md.
// The leaf's look belongs to the feed themes: pass `tokens` to skin it.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FeedTheme } from "@prayer-tower/shared";

import { LeafMark } from "@/layouts/motifs";
import { circuitTokens } from "@/layouts/circuit";
import { tabletTokens } from "@/layouts/tower";
import { vineTokens } from "@/layouts/vine";
import { useTalkCount } from "@/components/reply-helpers";
import { api, type MeaningEmoji, type MeaningLeaf } from "@/lib/api";
import { useFeatures } from "@/lib/features";
import { useLocale } from "@/lib/i18n";
import { announce } from "@/lib/motion";
import { moveOf } from "@/lib/talk";
import { colors, radius, space, type } from "@/lib/theme";
import { errorText } from "@/lib/error-report";

/** The part of a feed skin a leaf reads (the Vine skin's tokens fit this shape). */
export type LeafTokens = {
  leaf?: string;
  leafSoft?: string;
  leafShape?: "round" | "pointed" | "flower" | "star" | "tablet";
  branch?: string;
  tendril?: string;
};

/**
 * Word-leaf look for the member's feed skin (docs/FEED_SKINS.md): vine skins use their leaves
 * (flowers on Blossom Garden, stars on Neon Cinderella), the tower uses stone tablets, Neon
 * Circuit glows in its screen color. Other layouts keep the plain chip.
 */
export function wordLeafTokens(
  theme: FeedTheme | null,
): LeafTokens | undefined {
  if (theme?.layout === "vine") return vineTokens(theme);
  if (theme?.layout === "tower") return tabletTokens(theme);
  if (theme?.layout === "circuit") {
    const c = circuitTokens(theme);
    return {
      leaf: c.screen,
      leafSoft: "#F4F1FF",
      branch: c.wire,
      tendril: c.wire,
      leafShape: "round",
    };
  }
  return undefined;
}

/** One chosen meaning with how many chose it. Plain chip unless a skin passes tokens. */
export function Leaf({
  icon,
  label,
  count,
  mine,
  tokens,
  onPress,
}: {
  icon: string;
  label: string;
  count: number;
  mine: boolean;
  tokens?: LeafTokens;
  onPress?: () => void;
}) {
  const { t } = useLocale();
  const shape = tokens?.leafShape;
  const skinned = tokens?.leaf
    ? [
        {
          backgroundColor: tokens.leafSoft ?? colors.primarySoft,
          borderColor:
            shape === "tablet" ? (tokens.branch ?? tokens.leaf) : tokens.leaf,
        },
        shape === "pointed" && styles.pointed,
        shape === "tablet" && styles.tablet,
        // Your own leaf keeps the skin's colors and shows a heavier outline.
        mine && styles.mineSkinned,
      ]
    : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: mine }}
      accessibilityLabel={`${icon} ${t("meanings.leaf", { label, count })}${mine ? `, ${t("meanings.mine")}` : ""}`}
      onPress={onPress}
      style={[styles.leaf, mine && styles.leafMine, skinned]}
    >
      {tokens?.leaf && (shape === "flower" || shape === "star") ? (
        <LeafMark
          shape={shape}
          leaf={tokens.leaf}
          accent={tokens.tendril ?? tokens.leaf}
          size={16}
        />
      ) : null}
      <Text>{icon}</Text>
      <Text style={styles.leafLabel}>{label}</Text>
      {count > 1 ? <Text style={type.small}>{count}</Text> : null}
    </Pressable>
  );
}

export function MeaningReactions({
  postId,
  postBody,
  tokens,
}: {
  postId: string;
  postBody?: string;
  tokens?: LeafTokens;
}) {
  const { meaningReactions, meaningIconRow } = useFeatures();
  const count = useTalkCount();
  const { t, wording } = useLocale();
  const [tree, setTree] = useState<MeaningEmoji[]>([]);
  const [leaves, setLeaves] = useState<MeaningLeaf[]>([]);
  const [open, setOpen] = useState<MeaningEmoji | null>(null);
  const [error, setError] = useState<string | null>(null);
  const word = useCallback(
    (m: { label: string; neutralLabel: string }) =>
      wording === "neutral" ? m.neutralLabel : m.label,
    [wording],
  );

  useEffect(() => {
    if (!meaningReactions) return;
    let live = true;
    Promise.all([api.reactionMeanings(), api.meanings(postId)])
      .then(([tr, l]) => {
        if (!live) return;
        setTree(tr.emoji);
        setLeaves(l.leaves);
      })
      .catch((e: unknown) => live && setError(errorText(e)));
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
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  const choose = (emoji: string, meaning: string) =>
    act(() => api.chooseMeaning(postId, emoji, meaning)).then(
      (ok) =>
        ok &&
        count({
          kind: "emoji",
          emoji,
          meaning,
          toMove: moveOf(postBody) ?? "other",
        }),
    );
  const mineFor = (emoji: string) =>
    leaves.find((l) => l.emoji === emoji && l.mine);

  // With "Meanings in the icon row" on, the meanings ride on the card's one row of action
  // icons (components/meaning-chooser.tsx), so this separate emoji row would be a second
  // row of icons (Steve, 2026-10-29): only the words already added are shown here.
  const tray = !meaningIconRow;
  if (!tray && !leaves.length) return null;

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
              onPress={() =>
                l.mine
                  ? act(() => api.removeMeaning(postId, l.emoji))
                  : choose(l.emoji, l.meaning)
              }
            />
          ))}
        </View>
      ) : null}
      {tray ? (
        <View style={styles.row} role="group" aria-label={t("meanings.tray")}>
          {tree.map((e) => (
            <Pressable
              key={e.key}
              testID={`meaning-${e.key}`}
              accessibilityRole="button"
              accessibilityHint={t("meanings.hint")}
              accessibilityLabel={`${e.emoji} ${word(e.meanings[0]!)}`}
              accessibilityActions={[
                {
                  name: "longpress",
                  label: t("meanings.choose", { emoji: e.emoji }),
                },
              ]}
              onAccessibilityAction={() => {
                setOpen(e);
                announce(t("meanings.choose", { emoji: e.emoji }));
              }}
              onPress={() => choose(e.key, e.meanings[0]!.key)}
              onLongPress={() => setOpen(e)}
              style={({ pressed }) => [
                styles.emoji,
                mineFor(e.key) && styles.leafMine,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.emojiText} maxFontSizeMultiplier={2}>
                {e.emoji}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {open ? (
        <View
          style={styles.tree}
          role="group"
          aria-label={t("meanings.choose", { emoji: open.emoji })}
        >
          {open.meanings.map((m) => {
            const on = mineFor(open.key)?.meaning === m.key;
            return (
              <Pressable
                key={m.key}
                testID={`meaning-${open.key}-${m.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${open.emoji} ${word(m)}`}
                onPress={() => choose(open.key, m.key)}
                style={[styles.choice, on && styles.leafMine]}
              >
                <Text style={styles.leafLabel}>
                  {open.emoji} {word(m)}
                </Text>
              </Pressable>
            );
          })}
          {mineFor(open.key) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => act(() => api.removeMeaning(postId, open.key))}
              style={styles.choice}
            >
              <Text style={type.small}>{t("meanings.remove")}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("meanings.close")}
            onPress={() => setOpen(null)}
            style={styles.close}
          >
            <Text style={type.small}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <Text style={[type.small, { color: colors.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  // 44 points: Apple's smallest comfortable tap target.
  leaf: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  // A leaf's outline: two rounded corners, two points.
  pointed: {
    borderTopLeftRadius: 2,
    borderBottomRightRadius: 2,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  // A stone tablet: squared corners with a rounded top.
  tablet: {
    borderRadius: 3,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    borderWidth: 1.5,
  },
  mineSkinned: { borderWidth: 2.5 },
  leafMine: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  leafLabel: { fontSize: 15, color: colors.text },
  emoji: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emojiText: { fontSize: 20 },
  tree: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  close: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
