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
import { KindnessPromise } from '@/components/kind-norms';
import { TellFounder } from '@/components/tell-founder';
import { Highlights } from "@/components/highlights";
import { MacroNeeds } from "@/components/macro-needs";
import { DailyPassage } from "@/components/daily-passage";
import { GivingAsk, ThanksCard, WorldwideCount } from "@/components/notebook";
import { PostCard } from "@/components/post-card";
import { AcrossCard } from "@/components/across-card";
import { Announcements } from "@/components/announcements";
import { KindnessIntro } from "@/components/kindness-intro";
import { LiveNow } from "@/components/live-now";
import { SurveyPrompts } from "@/components/survey-prompts";
import { OfflineBanner } from "@/components/offline-banner";
import { Button, Chip, ErrorText, Screen } from "@/components/ui";
import { layoutFor } from "@/layouts";
import {
  api,
  type Highlights as HighlightsData,
  type MacroNeed,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFeature } from "@/lib/community-features";
import { useT } from "@/lib/i18n";
import { useOffline } from "@/lib/offline";
import { updatePrayWidget } from "@/lib/pray-widget";
import { breakpoints, colors, maxContentWidth, radius, space, type } from "@/lib/theme";
import { tourSeen } from "@/lib/tour";

/** Wide screens show the highlights in a right column; phones link to them. */
const SIDE_WIDTH = 320;
/** A skin's single lane on a very wide window: room for the vine to swoop, still easy to read. */
const WIDE_LANE = 880;

export default function Feed() {
  const t = useT();
  const { profile } = useAuth();
  const highlightsOn = useFeature("highlights");
  const [cards, setCards] = useState<Card[]>([]);
  const [theme, setTheme] = useState<FeedTheme | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "testimonies">("all");
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [needs, setNeeds] = useState<MacroNeed[]>([]);
  const [highlights, setHighlights] = useState<HighlightsData | null>(null);
  const width = useWindowDimensions().width;
  const wide = width >= breakpoints.split;
  const veryWide = width >= breakpoints.twoColumnFeed;
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
      // The feed shows as soon as it arrives; the side panels fill in on their own.
      api.macroNeeds().then((mn) => setNeeds(mn.needs), () => undefined);
      api.highlights().then(setHighlights, () => undefined);
      const page = await api.feed(0, filter);
      setCards(page.posts);
      setTheme(page.theme ?? null);
      setPinnedId(page.pinnedId);
      if (filter === "all") updatePrayWidget(page, t);
      setNextPage(page.savedAt ? null : page.nextPage);
      setSavedAt(page.savedAt ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [t, filter]);

  const loadMore = async () => {
    if (nextPage === null || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await api.feed(nextPage, filter);
      setCards((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.posts.filter((p) => !seen.has(p.id))];
      });
      setNextPage(page.nextPage);
    } finally {
      loadingMore.current = false;
    }
  };

  // Prayers and posts made offline were just sent: reload so they show. (The
  // reload that brought us back online may have finished before they were sent.)
  const queuedCount = useOffline().queued.length;
  const lastQueued = useRef(queuedCount);
  useEffect(() => {
    if (queuedCount < lastQueued.current) load();
    lastQueued.current = queuedCount;
  }, [queuedCount, load]);

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
  // Only the plain column puts cards side by side. The skins draw their own structure, so on a
  // very wide window (iPad landscape, Mac) they get one roomier lane instead of a stretched one.
  const columns = veryWide && (theme?.layout ?? 'column') === 'column' ? 2 : 1;
  const feedWidth = columns > 1 ? columns * maxContentWidth + (columns - 1) * space.lg : veryWide ? WIDE_LANE : maxContentWidth;

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
      <Announcements />
      <KindnessIntro />
      <LiveNow />
      <SurveyPrompts />
      <TellFounder small />
      <KindnessPromise />
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
      <View style={styles.filters}>
        <Chip radio label={t("feed.filterAll")} selected={filter === "all"} onPress={() => setFilter("all")} />
        <Chip radio label={t("feed.filterTestimonies")} selected={filter === "testimonies"} onPress={() => setFilter("testimonies")} />
      </View>
      {filter === "testimonies" ? <Text style={type.small}>{t("feed.testimoniesHint")}</Text> : null}
      <WorldwideCount />
      {!wide && highlightsOn ? (
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
      {filter === "all" ? <DailyPassage /> : null}
      {filter === "all" ? <ThanksCard /> : null}
      {filter === "all" ? <GivingAsk /> : null}
      {filter === "all" ? <AcrossCard onAction={onAction} /> : null}
      <ErrorText error={error} />
    </View>
  );

  return (
    <Screen style={wide ? [styles.wideScreen, { maxWidth: feedWidth + SIDE_WIDTH + space.lg }] : undefined}>
      <View style={wide ? [styles.feedColumn, { maxWidth: feedWidth }] : styles.fill}>
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
          columns={columns}
        />
      </View>
      {wide && highlightsOn ? (
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
  filters: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
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
    flexDirection: "row",
    gap: space.lg,
  },
  feedColumn: { flex: 1 },
  side: { width: SIDE_WIDTH, flexGrow: 0 },
  sideContent: { paddingVertical: space.lg },
});
