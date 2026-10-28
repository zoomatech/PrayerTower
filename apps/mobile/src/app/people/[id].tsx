// Someone's profile: who they are, follow or unfollow, and the requests they
// posted under their name. Anonymous posts never appear here.
import { WHY_HERE_LABELS, type Card, type Person } from '@prayer-tower/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useCardActions } from '@/components/card-actions';
import { PostCard } from '@/components/post-card';
import { Button, Empty, ErrorText, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { space, type } from '@/lib/theme';

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [person, setPerson] = useState<Person | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.person(id);
      setPerson(r.person);
      setCards(r.posts);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const { onAction, sheets } = useCardActions(load);

  const toggleFollow = async () => {
    if (!person) return;
    try {
      await (person.following ? api.unfollow(person.id) : api.follow(person.id));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label="‹ Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <ErrorText error={error} />
        {person ? (
          <View style={styles.head}>
            <Text style={type.title}>{person.displayName}</Text>
            {person.whyHere.length ? (
              <Text style={type.body}>{person.whyHere.map((w) => WHY_HERE_LABELS[w as keyof typeof WHY_HERE_LABELS] ?? w).join(' · ')}</Text>
            ) : null}
            <Text style={type.small}>
              {person.followers} {person.followers === 1 ? 'follower' : 'followers'}
            </Text>
            <Button
              variant={person.following ? 'secondary' : 'primary'}
              label={person.following ? 'Following' : 'Follow'}
              onPress={toggleFollow}
            />
          </View>
        ) : null}
        {person && cards.length === 0 ? <Empty text={`${person.displayName} has not posted under their name yet.`} /> : null}
        {cards.map((c) => (
          <PostCard key={c.id} card={c} onAction={onAction} />
        ))}
      </ScrollView>
      {sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  head: { gap: space.sm },
});
