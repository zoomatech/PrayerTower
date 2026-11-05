// Your branch: every request you have shared, drawn as one branch of the vine.
// Tendrils on each fruit show the people who promised to pray.
import type { Card } from '@prayer-tower/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { PostCard } from '@/components/post-card';
import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { VineLayout } from '@/layouts/vine';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

export default function Branch() {
  const { t } = useLocale();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const loadingMore = useRef(false);
  const load = useCallback(() => {
    setRefreshing(true);
    api
      .myBranch()
      .then((r) => {
        setCards(r.posts);
        setNextPage(r.nextPage ?? null);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setRefreshing(false));
  }, []);
  // The branch comes a page at a time; the next page loads near the end, one request at a time.
  const more = useCallback(() => {
    if (nextPage === null || loadingMore.current) return;
    loadingMore.current = true;
    api
      .myBranch(nextPage)
      .then((r) => {
        setCards((have) => {
          const ids = new Set((have ?? []).map((c) => c.id));
          return [...(have ?? []), ...r.posts.filter((c) => !ids.has(c.id))];
        });
        setNextPage(r.nextPage ?? null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => {
        loadingMore.current = false;
      });
  }, [nextPage]);
  useFocusEffect(load);
  const { onAction, sheets } = useCardActions(load);
  const renderCard = useCallback((card: Card) => <PostCard card={card} onAction={onAction} />, [onAction]);

  const header = (
    <View style={styles.header}>
      <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      <Text style={type.title}>{t('vine.branchTitle')}</Text>
      <Text style={type.body}>{t('vine.branchIntro')}</Text>
      {cards && !cards.length ? <Empty text={t('vine.branchEmpty')} /> : null}
      <ErrorText error={error} onRetry={load} />
    </View>
  );

  return (
    <Screen>
      <VineLayout
        cards={cards ?? []}
        theme={null}
        pinnedId={null}
        renderCard={renderCard}
        header={header}
        refreshing={refreshing}
        onRefresh={load}
        onEndReached={more}
        atEnd={nextPage === null}
        onAction={onAction}
      />
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: space.lg, gap: space.md },
});
