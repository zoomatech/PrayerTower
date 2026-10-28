import type { Card, FeedTheme, Prompt } from "@prayer-tower/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useCardActions } from "@/components/card-actions";
import { Highlights } from "@/components/highlights";
import { MacroNeeds } from "@/components/macro-needs";
import { PostCard } from "@/components/post-card";
import { OfflineBanner } from "@/components/offline-banner";
import { Button, ErrorText, Screen } from "@/components/ui";
import { layoutFor } from "@/layouts";
import {
  api,
  type Highlights as HighlightsData,
  type MacroNeed,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { updatePrayWidget } from "@/lib/pray-widget";
import { colors, maxContentWidth, radius, space, type } from "@/lib/theme";
import { tourSeen } from "@/lib/tour";

/** Wide screens show the highlights in a right column; phones link to them. */
const WIDE = 1000;
const SIDE_WIDTH = 320;

export default function Feed() {
  const t = useT();
  const { profile } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [theme, setTheme] = useState<FeedTheme | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [needs, setNeeds] = useState<MacroNeed[]>([]);
  const [highlights, setHighlights] = useState<HighlightsData | null>(null);
  const wide = useWindowDimensions().width >= WIDE;
  const loadingMore = useRef(false);

  // First time on this device: show the short tour once.
  useEffect(() => {
    if (!profile?.id) return;
    tourSeen(profile.id).then((seen) => {
      if (!seen) router.push("/tour");
    });
  }, [profile?.id]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [page, mn] = await Promise.all([
        api.feed(0),
        api.macroNeeds().catch(() => ({ needs: [] })),
      ]);
      setNeeds(mn.needs);
      api.highlights().then(setHighlights, () => undefined);
      setCards(page.posts);
      setTheme(page.theme ?? null);
      setPinnedId(page.pinnedId);
      updatePrayWidget(page, t);
      setNextPage(page.savedAt ? null : page.nextPage);
      setSavedAt(page.savedAt ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const loadMore = async () => {
    if (nextPage === null || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await api.feed(nextPage);
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setNextPage(page.nextPage);
    } finally {
      loadingMore.current = false;
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
      api
        .prompt()
        .then((r) => setPrompt(r.prompt))
        .catch(() => undefined);
    }, [load]),
  );

  const { onAction, sheets } = useCardActions(load);
  const Layout = layoutFor(theme);

  // "Not for me": the post leaves this feed and never comes back.
  const hide = useCallback((card: Card) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id));
    api.hidePost(card.id).catch((e) => setError((e as Error).message));
  }, []);
  const renderCard = useCallback((card: Card) => <PostCard card={card} onAction={onAction} onHide={hide} />, [onAction, hide]);

  const answerPrompt = async (response: "prayed" | "dismissed") => {
    if (!prompt) return;
    setPrompt(null);
    await api.answerPrompt(prompt.id, response).catch(() => undefined);
    if (response === "prayed") load();
  };

  const header = (
    <View style={{ gap: space.lg, marginBottom: space.lg }}>
      <OfflineBanner savedAt={savedAt} />
      <Pressable
        style={styles.composer}
        onPress={() => router.push("/compose")}
        accessibilityRole="button"
      >
        <Text style={styles.greeting}>
          {t("compose.greeting", { name: profile?.display_name || t("common.friend") })}
        </Text>
        <Text style={styles.placeholder}>{t("feed.composer")}</Text>
      </Pressable>
      {!wide ? (
        <Text
          style={styles.weekLink}
          onPress={() => router.push("/highlights")}
          accessibilityRole="link"
        >
          {t("feed.weekLink")}
        </Text>
      ) : null}
      <MacroNeeds
        needs={needs}
        onAction={onAction}
        onHelped={(id) =>
          api
            .helpedMacroNeed(id)
            .then(load, (e) => setError((e as Error).message))
        }
      />
      {prompt ? (
        <View style={styles.prompt}>
          <Text style={type.heading}>{prompt.question}</Text>
          <View style={styles.promptActions}>
            <Button
              small
              label={t("feed.prayed")}
              onPress={() => answerPrompt("prayed")}
            />
            <Button
              small
              variant="secondary"
              label={t("feed.openRequest")}
              onPress={() => router.push(`/post/${prompt.postId}`)}
            />
            <Button
              small
              variant="ghost"
              label={t("feed.notNow")}
              onPress={() => answerPrompt("dismissed")}
            />
          </View>
        </View>
      ) : null}
      <ErrorText error={error} />
    </View>
  );

  return (
    <Screen style={wide ? styles.wideScreen : undefined}>
      <View style={wide ? styles.feedColumn : styles.fill}>
        <Layout
          cards={cards}
          theme={theme}
          pinnedId={pinnedId}
          renderCard={renderCard}
          header={header}
          refreshing={refreshing}
          onRefresh={load}
          onEndReached={loadMore}
          atEnd={nextPage === null}
          onAction={onAction}
        />
      </View>
      {wide ? (
        <ScrollView
          style={styles.side}
          contentContainerStyle={styles.sideContent}
        >
          <Highlights data={highlights} />
        </ScrollView>
      ) : null}
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  composer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  greeting: { ...type.heading, color: colors.primary },
  placeholder: { ...type.body, color: colors.textMuted },
  prompt: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  promptActions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  weekLink: { ...type.small, color: colors.primary, fontWeight: "600" },
  fill: { flex: 1 },
  wideScreen: {
    maxWidth: maxContentWidth + SIDE_WIDTH + space.lg,
    flexDirection: "row",
    gap: space.lg,
  },
  feedColumn: { flex: 1, maxWidth: maxContentWidth },
  side: { width: SIDE_WIDTH, flexGrow: 0 },
  sideContent: { paddingVertical: space.lg },
});
