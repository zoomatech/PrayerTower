import type { Card, FeedTheme, Prompt } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { PostCard } from '@/components/post-card';
import { Button, ErrorText, Screen } from '@/components/ui';
import { layoutFor } from '@/layouts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radius, space, type } from '@/lib/theme';

export default function Feed() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [theme, setTheme] = useState<FeedTheme | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const page = await api.feed(0);
      setCards(page.posts);
      setTheme(page.theme ?? null);
      setPinnedId(page.pinnedId);
      setNextPage(page.nextPage);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadMore = async () => {
    if (nextPage === null || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await api.feed(nextPage);
      setCards((prev) => [...prev, ...page.posts.filter((p) => !prev.some((c) => c.id === p.id))]);
      setNextPage(page.nextPage);
    } finally {
      loadingMore.current = false;
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
      api.prompt().then((r) => setPrompt(r.prompt)).catch(() => undefined);
    }, [load]),
  );

  const { onAction, sheets } = useCardActions(load);
  const Layout = layoutFor(theme);

  const answerPrompt = async (response: 'prayed' | 'dismissed') => {
    if (!prompt) return;
    setPrompt(null);
    await api.answerPrompt(prompt.id, response).catch(() => undefined);
    if (response === 'prayed') load();
  };

  const header = (
    <View style={{ gap: space.lg, marginBottom: space.lg }}>
      <Pressable style={styles.composer} onPress={() => router.push('/compose')} accessibilityRole="button">
        <Text style={styles.greeting}>Welcome, {profile?.display_name || 'friend'}! Let&apos;s talk to the Lord.</Text>
        <Text style={styles.placeholder}>Type your prayer here…</Text>
      </Pressable>
      {prompt ? (
        <View style={styles.prompt}>
          <Text style={type.heading}>{prompt.question}</Text>
          <View style={styles.promptActions}>
            <Button small label="I prayed" onPress={() => answerPrompt('prayed')} />
            <Button small variant="secondary" label="Open request" onPress={() => router.push(`/post/${prompt.postId}`)} />
            <Button small variant="ghost" label="Not now" onPress={() => answerPrompt('dismissed')} />
          </View>
        </View>
      ) : null}
      <ErrorText error={error} />
    </View>
  );

  return (
    <Screen>
      <Layout
        cards={cards}
        theme={theme}
        pinnedId={pinnedId}
        renderCard={(card) => <PostCard card={card} onAction={onAction} />}
        header={header}
        refreshing={refreshing}
        onRefresh={load}
        onEndReached={loadMore}
        atEnd={nextPage === null}
      />
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
  prompt: { backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  promptActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
