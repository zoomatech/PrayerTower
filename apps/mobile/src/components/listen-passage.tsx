// Listening (docs/LIBRARY_SEARCH.md): Listen reads a passage aloud with the device's own voice (nothing leaves
// the device). Where LibriVox has a public-domain recording of the same translation, the member can play that
// instead, with the reader's credit. Each member's place is kept as they listen, so the Listening room can offer
// to pick up where they left off. Off unless an admin turns on Admin → Bible Reference Text Search → Listening.
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api, type LibraryCollectionId, type LibraryRecording, type ListenKind, type ListenPlace } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

/** How often a playing recording's place is kept, in seconds. */
const KEEP_EVERY = 15;

const keep = (place: ListenPlace) => void api.saveListening(place).catch(() => undefined);

/**
 * Listen buttons under a passage. `start` picks up where the member left off: the device's voice from the
 * character it had reached, or the recording from the second it had reached.
 */
export function ListenPassage({
  collection,
  passageKey,
  text,
  citation,
  start,
  recording: known,
}: {
  collection: LibraryCollectionId;
  passageKey: string;
  text: string;
  citation: string;
  start?: { kind: ListenKind; position: number };
  recording?: LibraryRecording | null;
}) {
  const t = useT();
  const features = useFeatures();
  const [speaking, setSpeaking] = useState(false);
  // undefined: not looked up yet; null: no recording of this place.
  const [recording, setRecording] = useState<LibraryRecording | null | undefined>(known ?? undefined);
  const [pressedPlay, setPlaying] = useState(false);
  const player = useAudioPlayer(recording ? { uri: recording.url } : null);
  const status = useAudioPlayerStatus(player);
  // A recording that has played to its end is no longer playing.
  const playing = pressedPlay && !status.didJustFinish;
  // The device's voice: where this reading began in the passage, and how far it has got.
  const begin0 = start?.kind === 'voice' ? Math.min(start.position, text.length) : 0;
  const from = useRef(begin0);
  const reached = useRef(begin0);
  const sought = useRef(false);
  useEffect(() => () => void Speech.stop(), []);

  // Keeps a playing recording's place now and then, and when it ends.
  useEffect(() => {
    if (!playing || !recording) return;
    const id = setInterval(() => keep({ collection, key: passageKey, kind: 'recording', position: player.currentTime ?? 0, duration: player.duration || recording.seconds }), KEEP_EVERY * 1000);
    return () => clearInterval(id);
  }, [playing, recording, collection, passageKey, player]);
  useEffect(() => {
    if (status.didJustFinish && recording) {
      keep({ collection, key: passageKey, kind: 'recording', position: recording.seconds, duration: recording.seconds, finished: true });
    }
  }, [status.didJustFinish, recording, collection, passageKey]);
  if (!features.libraryListen) return null;

  const speak = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    if (from.current >= text.length) from.current = 0;
    const begin = from.current;
    reached.current = begin;
    setSpeaking(true);
    keep({ collection, key: passageKey, kind: 'voice', position: begin });
    const stopped = () => {
      setSpeaking(false);
      from.current = reached.current;
      keep({ collection, key: passageKey, kind: 'voice', position: reached.current });
    };
    Speech.speak(begin > 0 ? text.slice(begin) : `${text}\n${citation}`, {
      language: 'en-US',
      onBoundary: (e: { charIndex: number }) => {
        reached.current = Math.min(text.length, begin + e.charIndex);
      },
      onDone: () => {
        setSpeaking(false);
        from.current = 0;
        keep({ collection, key: passageKey, kind: 'voice', position: text.length, finished: true });
      },
      onStopped: stopped,
      onError: stopped,
    });
  };
  const look = () =>
    api.libraryRecording(collection, passageKey).then(
      (r) => setRecording(r.recording),
      () => setRecording(null),
    );
  const play = () => {
    if (!recording) return;
    if (playing) {
      player.pause();
      setPlaying(false);
      keep({ collection, key: passageKey, kind: 'recording', position: player.currentTime ?? 0, duration: player.duration || recording.seconds });
    } else {
      void Speech.stop();
      setSpeaking(false);
      if (!sought.current && start?.kind === 'recording' && start.position > 0) player.seekTo(start.position);
      sought.current = true;
      player.play();
      setPlaying(true);
      keep({ collection, key: passageKey, kind: 'recording', position: player.currentTime || (start?.kind === 'recording' ? start.position : 0), duration: recording.seconds });
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Button small variant="ghost" label={speaking ? t('library.listenStop') : t('library.listen')} a11yLabel={t(speaking ? 'library.listenStopOne' : 'library.listenOne', { citation })} onPress={speak} />
        {recording === undefined ? <Button small variant="ghost" label={t('library.listenFind')} a11yLabel={t('library.listenFindOne', { citation })} onPress={look} /> : null}
        {recording ? <Button small variant="secondary" label={playing ? t('library.listenPause') : t('library.listenPlay')} a11yLabel={t(playing ? 'library.listenPause' : 'library.listenPlayOne', { title: recording.title })} onPress={play} /> : null}
      </View>
      {recording ? (
        <Text style={type.small} onPress={() => Linking.openURL(recording.projectUrl)} accessibilityRole="link">
          {recording.credit}
        </Text>
      ) : null}
      {recording === null ? <Text style={type.small}>{t('library.listenNone')}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
