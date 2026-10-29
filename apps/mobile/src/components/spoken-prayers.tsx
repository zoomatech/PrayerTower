// Spoken prayers on a request (off unless an admin turns them on). The person who
// asked turns them on for this request and may offer tokens; people who prayed
// can record one short voice prayer; the person who asked listens to each one.
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Button, Chip } from '@/components/ui';
import { api, type SpokenPrayer, type SpokenPrayerStatus } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { space, type } from '@/lib/theme';
import { errorText } from '@/lib/error-report';

const OFFERS = [0, 1, 2, 5, 10];

export function SpokenPrayers({ postId }: { postId: string }) {
  const { t } = useLocale();
  const [status, setStatus] = useState<SpokenPrayerStatus | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => {
    api.spokenPrayers(postId).then(setStatus).catch(() => setStatus(null));
  }, [postId]);
  useEffect(load, [load]);

  if (!status?.enabled) return null;
  const fail = (e: unknown) => setNote(errorText(e));
  if (status.mine) {
    return (
      <View style={styles.section} role="group" aria-label={t('spoken.heading')}>
        <Text style={type.heading}>{t('spoken.heading')}</Text>
        <Text style={type.small}>{t('spoken.askHint')}</Text>
        <View style={styles.row}>
          <Chip label={t('spoken.off')} selected={!status.invited} onPress={() => api.uninviteSpokenPrayers(postId).then(load, fail)} />
          {OFFERS.filter((n) => n <= status.maxOfferTokens).map((n) => (
            <Chip
              key={n}
              label={n === 0 ? t('spoken.free') : t('spoken.offer', { count: n })}
              selected={status.invited && status.offerTokens === n}
              onPress={() => api.inviteSpokenPrayers(postId, n).then(load, fail)}
            />
          ))}
        </View>
        {status.received.length ? status.received.map((p) => <Received key={p.id} prayer={p} onChange={load} onNote={setNote} />) : status.invited ? <Text style={type.small}>{t('spoken.none')}</Text> : null}
        {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
      </View>
    );
  }
  if (!status.invited) return null;
  return (
    <View style={styles.section} role="group" aria-label={t('spoken.heading')}>
      <Text style={type.heading}>{t('spoken.heading')}</Text>
      <Text style={type.small}>{status.offerTokens ? t('spoken.theyOffer', { count: status.offerTokens }) : t('spoken.theyAsked')}</Text>
      {status.sent ? (
        <Text style={type.small}>{t('spoken.sent')}</Text>
      ) : !status.prayed ? (
        <Text style={type.small}>{t('spoken.prayFirst')}</Text>
      ) : (
        <Recorder postId={postId} maxSeconds={status.maxSeconds} onSent={load} onNote={setNote} />
      )}
      {note ? <Text style={type.small} accessibilityLiveRegion="polite">{note}</Text> : null}
    </View>
  );
}

function Received({ prayer, onChange, onNote }: { prayer: SpokenPrayer; onChange: () => void; onNote: (s: string) => void }) {
  const { t } = useLocale();
  const player = useAudioPlayer(prayer.url ? { uri: prayer.url } : null);
  const play = async () => {
    player.seekTo(0);
    player.play();
    const r = await api.spokenListened(prayer.id).catch(() => null);
    if (r?.notEnoughTokens) onNote(t('spoken.notEnough', { count: prayer.offerTokens }));
    else if (r?.paid && !prayer.paid) onNote(t('spoken.paid', { count: prayer.offerTokens, name: prayer.from.displayName }));
    if (r && (!prayer.listened || r.paid !== prayer.paid)) onChange();
  };
  return (
    <View style={styles.item}>
      <Text style={type.body}>{t('spoken.from', { name: prayer.from.displayName, seconds: prayer.durationSeconds })}</Text>
      <View style={styles.row}>
        <Button small label={t('spoken.play')} disabled={!prayer.url} onPress={play} />
        <Button small variant="ghost" label={t('spoken.report')} onPress={() => api.report('spoken_prayer', prayer.id, 'Reported from a spoken prayer').then(() => onNote(t('spoken.reported')), (e) => onNote(errorText(e)))} />
        <Button small variant="ghost" label={t('spoken.remove')} onPress={() => api.removeSpokenPrayer(prayer.id).then(onChange, (e) => onNote(errorText(e)))} />
      </View>
    </View>
  );
}

function Recorder({ postId, maxSeconds, onSent, onNote }: { postId: string; maxSeconds: number; onSent: () => void; onNote: (s: string) => void }) {
  const { t } = useLocale();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [take, setTake] = useState<{ uri: string; seconds: number } | null>(null);
  const [sending, setSending] = useState(false);
  const seconds = Math.floor(state.durationMillis / 1000);

  const stop = useCallback(async () => {
    const secs = Math.max(1, Math.round(recorder.currentTime));
    await recorder.stop();
    if (recorder.uri) setTake({ uri: recorder.uri, seconds: Math.min(secs, maxSeconds) });
  }, [recorder, maxSeconds]);
  // Stop at the time limit.
  useEffect(() => {
    if (state.isRecording && seconds >= maxSeconds) stop();
  }, [state.isRecording, seconds, maxSeconds, stop]);

  const start = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return onNote(t('spoken.micNeeded'));
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    setTake(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const send = async () => {
    if (!take) return;
    setSending(true);
    try {
      const contentType = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
      const { path, token } = await api.spokenUploadUrl(postId, contentType);
      const body = await fetch(take.uri).then((r) => r.arrayBuffer());
      const { error } = await supabase.storage.from('spoken-prayers').uploadToSignedUrl(path, token, body, { contentType });
      if (error) throw new Error(error.message);
      await api.sendSpokenPrayer(postId, path, take.seconds);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      onSent();
    } catch (e) {
      onNote(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.item}>
      <Text style={type.small}>{t('spoken.recordHint', { seconds: maxSeconds })}</Text>
      {state.isRecording ? (
        <>
          <Text style={type.body} accessibilityLiveRegion="polite">{t('spoken.recording', { seconds, max: maxSeconds })}</Text>
          <Button label={t('spoken.stop')} onPress={stop} />
        </>
      ) : take ? (
        <View style={styles.row}>
          <Button label={sending ? t('spoken.sending') : t('spoken.send', { seconds: take.seconds })} disabled={sending} onPress={send} />
          <Button variant="ghost" label={t('spoken.again')} disabled={sending} onPress={start} />
        </View>
      ) : (
        <Button variant="secondary" label={t('spoken.record')} onPress={start} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  item: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
