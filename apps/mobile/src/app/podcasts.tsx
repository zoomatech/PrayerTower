// Podcasts from the staff (Admin → Podcasts), shown on Me only while switched on.
// Audio streams from where staff host it.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Empty, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type PodcastEpisode, type PodcastShow } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

export const minutes = (seconds: number | null) => (seconds ? Math.max(1, Math.round(seconds / 60)) : null);

export default function Podcasts() {
  const { t } = useLocale();
  const [shows, setShows] = useState<PodcastShow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<PodcastEpisode | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.podcasts().then(
      (r) => setShows(r.shows),
      (e) => setError((e as Error).message),
    );
  }, []);
  useFocusEffect(load);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('podcasts.title')}</Text>
        {playing ? <Player episode={playing} onClose={() => setPlaying(null)} /> : null}
        {error ? <ErrorText error={error} onRetry={load} /> : shows === null ? <Loading /> : shows.length === 0 ? <Empty text={t('podcasts.empty')} /> : null}
        {shows?.map((s) => (
          <View key={s.id} style={styles.section}>
            <Text style={type.heading}>{s.title}</Text>
            <Text style={type.small}>{s.author}</Text>
            <Text style={type.body}>{s.description}</Text>
            {s.episodes.map((e) => (
              <View key={e.id} style={styles.card}>
                <Text style={styles.cardTitle}>{e.title}</Text>
                {e.description ? <Text style={type.body}>{e.description}</Text> : null}
                <Text style={type.small}>
                  {new Date(e.publishedAt!).toDateString()}
                  {minutes(e.durationSeconds) ? ` · ${t('podcasts.minutes', { count: minutes(e.durationSeconds) ?? 0 })}` : ''}
                </Text>
                <Button small variant="secondary" label={t('podcasts.play', { title: e.title })} onPress={() => setPlaying(e)} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function Player({ episode, onClose }: { episode: PodcastEpisode; onClose: () => void }) {
  const { t } = useLocale();
  const player = useAudioPlayer({ uri: episode.audioUrl });
  const status = useAudioPlayerStatus(player);
  return (
    <View style={[styles.card, styles.player]} role="region" aria-label={t('podcasts.nowPlaying')}>
      <Text style={type.small}>{t('podcasts.nowPlaying')}</Text>
      <Text style={styles.cardTitle}>{episode.title}</Text>
      <View style={styles.row}>
        <Button small label={status.playing ? t('podcasts.pause') : t('podcasts.resume')} onPress={() => (status.playing ? player.pause() : player.play())} />
        <Button small variant="ghost" label={t('podcasts.back15')} onPress={() => player.seekTo(Math.max(0, status.currentTime - 15))} />
        <Button
          small
          variant="ghost"
          label={t('podcasts.close')}
          onPress={() => {
            player.pause();
            onClose();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  section: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: space.xs,
  },
  player: { borderColor: colors.primary },
  cardTitle: { ...type.body, fontWeight: '700' },
});
