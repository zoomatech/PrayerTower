// The Listening room (docs/LIBRARY_SEARCH.md): what the member has listened to, newest first, kept on the server
// so it follows them to any device. Each time it opens it asks whether to pick up where they left off.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ListenPassage } from '@/components/listen-passage';
import { Button, ErrorText, Loading, Screen } from '@/components/ui';
import { api, type LibraryListened } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

const id = (l: LibraryListened) => `${l.collection}/${l.key}/${l.kind}`;

export default function ListeningRoomScreen() {
  const t = useT();
  const features = useFeatures();
  const [history, setHistory] = useState<LibraryListened[] | null>(null);
  const [resume, setResume] = useState<LibraryListened | null>(null);
  // The question is asked each time the room opens; null once answered.
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setOpen(null);
    api.listening().then(
      (r) => {
        setHistory(r.history);
        setResume(r.resume);
        setAsking(r.resume !== null);
      },
      (e) => setError((e as Error).message),
    );
  }, []);
  useFocusEffect(load);

  const where = (l: LibraryListened) =>
    l.finished
      ? t('library.listeningFinished')
      : l.kind === 'recording'
        ? t('library.listeningRecordingAt', { at: clock(l.position), total: clock(l.duration ?? l.recording?.seconds ?? 0) })
        : t('library.listeningVoiceAt', { percent: String(Math.round((100 * l.position) / Math.max(1, l.text.length))) });
  const player = (l: LibraryListened) => (
    <ListenPassage
      collection={l.collection}
      passageKey={l.key}
      text={l.text}
      citation={l.citation}
      recording={l.kind === 'recording' ? l.recording : undefined}
      start={l.finished ? undefined : { kind: l.kind, position: l.position }}
    />
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title} accessibilityRole="header">
          {t('library.listeningTitle')}
        </Text>
        {!features.libraryListen ? null : (
          <>
            {error ? <ErrorText error={error} onRetry={load} /> : history === null ? <Loading /> : null}
            {asking && resume ? (
              <View style={[styles.card, styles.ask]} role="alert">
                <Text style={type.body}>{t('library.listeningResume')}</Text>
                <Text style={type.small}>
                  {resume.citation} · {where(resume)}
                </Text>
                <View style={styles.row}>
                  <Button
                    small
                    label={t('library.listeningResumeYes')}
                    onPress={() => {
                      setAsking(false);
                      setOpen(id(resume));
                    }}
                  />
                  <Button small variant="ghost" label={t('library.listeningResumeNo')} onPress={() => setAsking(false)} />
                </View>
              </View>
            ) : null}
            {history ? <Text style={type.small}>{t('library.listeningIntro')}</Text> : null}
            {history?.length === 0 ? <Text style={type.body}>{t('library.listeningNone')}</Text> : null}
            {history?.map((l) => (
              <View key={id(l)} style={styles.card}>
                <Text style={type.body}>{l.citation}</Text>
                <Text style={type.small}>{l.kind === 'recording' && l.recording ? t('library.listeningRecording', { title: l.recording.title }) : t('library.listeningVoice')}</Text>
                <Text style={type.small}>{where(l)}</Text>
                {open === id(l) ? player(l) : <Button small variant="ghost" label={t('library.listeningOpen')} a11yLabel={t('library.listeningOpenOne', { citation: l.citation })} onPress={() => setOpen(id(l))} />}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: 120 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: space.xs },
  ask: { borderWidth: 1, borderColor: colors.primary },
});
