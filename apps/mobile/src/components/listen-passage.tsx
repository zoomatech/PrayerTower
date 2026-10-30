// Listening (docs/LIBRARY_SEARCH.md): Listen reads a passage aloud with the device's own voice (nothing leaves
// the device). Where LibriVox has a public-domain recording of the same translation, the member can play that
// instead, with the reader's credit. Off unless an admin turns on Admin → Text search → Listening.
import { useAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { api, type LibraryCollectionId, type LibraryRecording } from '@/lib/api';
import { useFeatures } from '@/lib/features';
import { useT } from '@/lib/i18n';
import { space, type } from '@/lib/theme';

/** Listen buttons under a passage. */
export function ListenPassage({ collection, passageKey, text, citation }: { collection: LibraryCollectionId; passageKey: string; text: string; citation: string }) {
  const t = useT();
  const features = useFeatures();
  const [speaking, setSpeaking] = useState(false);
  // undefined: not looked up yet; null: no recording of this place.
  const [recording, setRecording] = useState<LibraryRecording | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const player = useAudioPlayer(recording ? { uri: recording.url } : null);
  useEffect(() => () => void Speech.stop(), []);
  if (!features.libraryListen) return null;

  const speak = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(`${text}\n${citation}`, { language: 'en-US', onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) });
  };
  const look = () =>
    api.libraryRecording(collection, passageKey).then(
      (r) => setRecording(r.recording),
      () => setRecording(null),
    );
  const play = () => {
    if (playing) {
      player.pause();
      setPlaying(false);
    } else {
      void Speech.stop();
      setSpeaking(false);
      player.play();
      setPlaying(true);
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
