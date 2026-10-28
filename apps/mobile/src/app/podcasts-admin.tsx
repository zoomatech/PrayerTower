// Admin → Podcasts: add shows and episodes (audio hosted elsewhere, linked by
// https), publish them, and copy each show's public feed link for podcast apps.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { staffOnly } from '@/components/staff-only';
import { Button, Empty, ErrorText, Field, Screen } from '@/components/ui';
import { api, type PodcastShow } from '@/lib/api';
import { env } from '@/lib/env';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const SLUG = /^[a-z0-9-]{3,40}$/;

function PodcastsAdmin() {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(true);
  const [shows, setShows] = useState<PodcastShow[]>([]);
  const [show, setShow] = useState({
    slug: '',
    title: '',
    description: '',
    author: '',
    imageUrl: '',
    community: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.podcasts();
      setEnabled(r.enabled);
      setShows(r.shows);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const validShow =
    SLUG.test(show.slug) &&
    show.title.trim() &&
    show.description.trim() &&
    show.author.trim() &&
    (!show.imageUrl.trim() || show.imageUrl.trim().startsWith('https://'));
  const createShow = () =>
    run(
      () =>
        api.admin.createPodcast({
          slug: show.slug,
          title: show.title.trim(),
          description: show.description.trim(),
          author: show.author.trim(),
          imageUrl: show.imageUrl.trim() || null,
          community: show.community.trim() || null,
        }),
      () =>
        setShow({
          slug: '',
          title: '',
          description: '',
          author: '',
          imageUrl: '',
          community: '',
        }),
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))} />
        <Text style={type.title}>{t('podcastsAdmin.title')}</Text>
        <Text style={type.body}>{t('podcastsAdmin.intro')}</Text>
        {!enabled ? <Text style={styles.notice}>{t('podcastsAdmin.off')}</Text> : null}
        <ErrorText error={error} />

        {shows.length === 0 && !error ? <Empty text={t('podcastsAdmin.empty')} /> : null}
        {shows.map((s) => (
          <ShowCard key={s.id} show={s} busy={busy} run={run} />
        ))}

        <View style={styles.section}>
          <Text style={type.heading}>{t('podcastsAdmin.newShow')}</Text>
          <Field
            label={t('podcastsAdmin.slug')}
            value={show.slug}
            onChangeText={(slug) => setShow((x) => ({ ...x, slug: slug.toLowerCase() }))}
            autoCapitalize="none"
            maxLength={40}
          />
          <Field label={t('podcastsAdmin.showTitle')} value={show.title} onChangeText={(title) => setShow((x) => ({ ...x, title }))} maxLength={120} />
          <Field
            label={t('podcastsAdmin.description')}
            value={show.description}
            onChangeText={(description) => setShow((x) => ({ ...x, description }))}
            maxLength={4000}
            multiline
          />
          <Field label={t('podcastsAdmin.author')} value={show.author} onChangeText={(author) => setShow((x) => ({ ...x, author }))} maxLength={120} />
          <Field
            label={t('podcastsAdmin.image')}
            value={show.imageUrl}
            onChangeText={(imageUrl) => setShow((x) => ({ ...x, imageUrl }))}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Field
            label={t('podcastsAdmin.community')}
            value={show.community}
            onChangeText={(community) => setShow((x) => ({ ...x, community }))}
            autoCapitalize="none"
            maxLength={40}
          />
          <Button label={t('podcastsAdmin.createShow')} onPress={createShow} busy={busy} disabled={!validShow} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function ShowCard({ show, busy, run }: { show: PodcastShow; busy: boolean; run: (fn: () => Promise<unknown>, after?: () => void) => Promise<void> }) {
  const { t } = useLocale();
  const [title, setTitle] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [mins, setMins] = useState('');
  const minutes = mins.trim() ? Number(mins.trim()) : null;
  const valid = title.trim() && audioUrl.trim().startsWith('https://') && (minutes === null || (Number.isInteger(minutes) && minutes > 0));
  const add = (publish: boolean) =>
    run(
      () =>
        api.admin.addEpisode(show.id, {
          title: title.trim(),
          audioUrl: audioUrl.trim(),
          durationSeconds: minutes ? minutes * 60 : null,
          publish,
        }),
      () => {
        setTitle('');
        setAudioUrl('');
        setMins('');
      },
    );
  return (
    <View style={styles.card}>
      <Text style={type.small}>
        {show.published ? t('podcastsAdmin.published') : t('podcastsAdmin.draft')}
        {show.community ? ` · ${show.community}` : ''} · {show.category}
      </Text>
      <Text style={styles.cardTitle}>{show.title}</Text>
      <Text style={type.small} selectable>
        {t('podcastsAdmin.feed', {
          url: `${env.apiUrl}/podcasts/${show.slug}/feed.xml`,
        })}
      </Text>
      <Button
        small
        variant="secondary"
        busy={busy}
        label={show.published ? t('podcastsAdmin.unpublish', { title: show.title }) : t('podcastsAdmin.publish', { title: show.title })}
        onPress={() => run(() => api.admin.updatePodcast(show.id, { published: !show.published }))}
      />
      {show.episodes.map((e) => (
        <View key={e.id} style={styles.episode}>
          <Text style={type.body}>
            {e.title}
            {e.publishedAt ? '' : ` · ${t('podcastsAdmin.episodeDraft')}`}
          </Text>
          <View style={styles.row}>
            <Button
              small
              variant="ghost"
              label={e.publishedAt ? t('podcastsAdmin.unpublish', { title: e.title }) : t('podcastsAdmin.publish', { title: e.title })}
              onPress={() => run(() => api.admin.updateEpisode(e.id, { published: !e.publishedAt }))}
            />
            <Button small variant="ghost" label={t('podcastsAdmin.remove', { title: e.title })} onPress={() => run(() => api.admin.removeEpisode(e.id))} />
          </View>
        </View>
      ))}
      <Text style={type.heading}>{t('podcastsAdmin.newEpisode')}</Text>
      <Field label={t('podcastsAdmin.episodeTitle')} value={title} onChangeText={setTitle} maxLength={200} />
      <Field label={t('podcastsAdmin.audio')} value={audioUrl} onChangeText={setAudioUrl} autoCapitalize="none" keyboardType="url" />
      <Field label={t('podcastsAdmin.minutes')} value={mins} onChangeText={setMins} keyboardType="number-pad" />
      <View style={styles.row}>
        <Button small label={t('podcastsAdmin.addEpisode')} busy={busy} disabled={!valid} onPress={() => add(true)} />
        <Button small variant="secondary" label={t('podcastsAdmin.addDraft')} busy={busy} disabled={!valid} onPress={() => add(false)} />
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
    gap: space.sm,
  },
  episode: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm,
  },
  cardTitle: { ...type.body, fontWeight: '700' },
  notice: {
    ...type.small,
    backgroundColor: colors.primarySoft,
    padding: space.sm,
    borderRadius: radius.md,
  },
});

export default staffOnly(PodcastsAdmin, ['admin']);
