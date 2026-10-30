// Listen: decode Prayer Tower radio bursts from the phone's microphone, live,
// with the station's own decoder (the same one the /listen web page uses).
// Shown only while Admin → Radio has the listening page on; with listener mode
// on too, also signed out (listen-on-air.tsx, from the sign-in screen). The
// sound never leaves the phone; with receipts on, the listener may send back
// fingerprints of the prayers heard so their senders learn they were heard.
// Every prayer decoded is kept on the phone as "Prayers heard on air" (heard-log.ts).
import { signalCode } from '@prayer-tower/shared';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Loading, Screen, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { addHeard, clearHeard, loadHeard, type HeardPrayer } from '@/lib/heard-log';
import { BurstListener, prayerHash, receiptHashes, SSTV_PRESET, SstvListener, toMono, type HeardFrame } from '@/lib/burst-listen';
import { flushPraying, tapPraying, tappedHashes } from '@/lib/praying-too';
import { useFeatures } from '@/lib/features';
import { useLocale } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const DECODE_EVERY_MS = 2000;

type Heard = HeardFrame & { key: string; at: Date; told: boolean };

export default function ListenScreen() {
  const { t } = useLocale();
  const { session } = useAuth();
  const features = useFeatures();
  const [saved, setSaved] = useState<HeardPrayer[]>([]);
  const [config, setConfig] = useState<{ enabled: boolean; receipts: boolean; prayingToo?: boolean; readAloud?: boolean; panel?: boolean } | null>(null);
  const [praying, setPraying] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<Heard[]>([]);
  const [meter, setMeter] = useState(0);
  const [tell, setTell] = useState(true);
  const [hf, setHf] = useState(false);
  // Read decoded prayers aloud with the device's own speech (offered while the admin's switch is on).
  const [aloud, setAloud] = useState(false);
  const aloudRef = useRef(false);
  useEffect(() => {
    aloudRef.current = aloud && !!config?.readAloud;
    if (!aloudRef.current) void Speech.stop();
  }, [aloud, config?.readAloud]);
  const listener = useRef<BurstListener | null>(null);
  // Prayer panels sent as SSTV pictures (offered while the admin's switch is on), off until turned on.
  const [sstv, setSstv] = useState(false);
  const sstvListener = useRef<SstvListener | null>(null);
  const sstvRef = useRef(false);
  const lastSstv = useRef(0);
  useEffect(() => {
    sstvRef.current = sstv && !!config?.panel;
    if (!sstvRef.current) sstvListener.current = null;
  }, [sstv, config?.panel]);
  const tellRef = useRef(tell);
  useEffect(() => {
    tellRef.current = tell;
  }, [tell]);

  const onBuffer = useCallback((b: AudioStreamBuffer) => {
    if (!listener.current) listener.current = new BurstListener(b.sampleRate);
    const mono = toMono(b.data, b.channels, 'float32');
    listener.current.push(mono);
    if (sstvRef.current) (sstvListener.current ??= new SstvListener(b.sampleRate)).push(mono);
  }, []);
  const { stream } = useAudioStream({ sampleRate: 48_000, channels: 1, encoding: 'float32', onBuffer });

  useEffect(() => {
    (session ? api.radioListen() : api.listenConfig()).then(setConfig, (e) => setError((e as Error).message));
    void loadHeard().then(setSaved);
    void tappedHashes().then(setPraying);
  }, [session]);

  // "I'm praying too" taps saved while offline go out when the app is back.
  useEffect(() => {
    if (!config?.prayingToo) return;
    void flushPraying();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void flushPraying());
    return () => sub.remove();
  }, [config?.prayingToo]);
  const prayToo = (callSign: string, hash: string) => {
    setPraying((all) => new Set([...all, hash]));
    void tapPraying({ callSign, hash });
  };

  const report = useCallback(
    async (f: Heard) => {
      if (!config?.receipts || !tellRef.current || !f.prayers?.length) return;
      const { matched } = await api.listenHeard({ callSign: f.callSign, preset: f.preset, snrDb: Math.round(f.snrDb * 10) / 10, hashes: receiptHashes(f) }).catch(() => ({ matched: 0 }));
      if (matched) setHeard((all) => all.map((h) => (h.key === f.key ? { ...h, told: true } : h)));
    },
    [config?.receipts],
  );

  // Decode the rolling window every couple of seconds while listening.
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => {
      const l = listener.current;
      if (!l) return;
      setMeter(l.meter);
      const fresh = l.decode(hf ? 50 : 0).map((f, i) => ({ ...f, key: `${Date.now()}-${i}`, at: new Date(), told: false }));
      // A whole SSTV picture with a prayer panel in it, read once.
      // Looking for a picture takes a moment, so only every six seconds.
      const now = Date.now();
      const pic = sstvListener.current && now - lastSstv.current >= 6000 ? ((lastSstv.current = now), sstvListener.current.read()) : null;
      if (pic?.panel?.prayers) {
        fresh.push({ callSign: pic.panel.callSign, preset: SSTV_PRESET, snrDb: 0, corrected: pic.panel.corrected, prayers: pic.panel.prayers, codec: 3, start: 0, end: pic.end, key: `sstv-${pic.end}`, at: new Date(), told: false });
      }
      if (!fresh.length) return;
      setHeard((all) => [...fresh.reverse(), ...all]);
      fresh.forEach((f) => void report(f));
      const prayers = fresh.flatMap((f) => (f.prayers ?? []).map((text) => ({ text, callSign: f.callSign, at: f.at.toISOString(), hash: prayerHash(text) })));
      if (prayers.length) void addHeard(prayers).then(setSaved);
      // An amplified prayer comes several times in one burst; it is read once.
      if (aloudRef.current) [...new Set(prayers.map((p) => p.text))].forEach((text) => Speech.speak(text, { language: 'en-US' }));
    }, hf ? DECODE_EVERY_MS * 2 : DECODE_EVERY_MS);
    return () => clearInterval(timer);
  }, [listening, report, hf]);

  const start = async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setError(t('listen.micNeeded'));
    setError(null);
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    listener.current = null;
    await stream.start();
    setListening(true);
  };

  const stop = useCallback(() => {
    stream.stop();
    setListening(false);
    setMeter(0);
    void setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  }, [stream]);
  // Stop the microphone and any reading when leaving the screen.
  useEffect(
    () => () => {
      if (stream.isStreaming) stream.stop();
      void Speech.stop();
    },
    [stream],
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Button small variant="ghost" label={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Text style={type.title}>{t('listen.title')}</Text>
        <ErrorText error={error} />
        {!config && !error ? <Loading /> : null}
        {config && !config.enabled ? <Text style={type.body}>{t('listen.off')}</Text> : null}
        {config?.enabled ? (
          <>
            <Text style={type.body}>{t('listen.intro')}</Text>
            {listening ? <Button label={t('listen.stop')} onPress={stop} /> : <Button label={t('listen.start')} onPress={start} />}
            <Text style={type.small} accessibilityLiveRegion="polite">
              {listening ? (heard.length ? t('listen.heardCount', { count: heard.length }) : t('listen.waiting')) : t('listen.stopped')}
            </Text>
            <View
              style={styles.meter}
              accessibilityRole="progressbar"
              accessibilityLabel={t('listen.level')}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(meter * 100) }}
            >
              <View style={[styles.meterFill, { width: `${Math.round(meter * 100)}%` }]} />
            </View>
            <Toggle label={t('listen.hf')} hint={t('listen.hfHint')} value={hf} onChange={setHf} />
            {config.receipts ? <Toggle label={t('listen.tell')} hint={t('listen.tellHint')} value={tell} onChange={setTell} /> : null}
            {config.readAloud ? <Toggle label={t('readAloud.toggle')} hint={t('readAloud.hint')} value={aloud} onChange={setAloud} /> : null}
            {config.panel ? <Toggle label={t('panel.sstv')} hint={t('panel.sstvHint')} value={sstv} onChange={setSstv} /> : null}
            {config.panel ? <Button small variant="secondary" label={t('panel.title')} onPress={() => router.push('/prayer-panel')} /> : null}
            {heard.map((f) => (
              <View key={f.key} style={styles.card}>
                <Text style={type.heading}>{t('listen.from', { callSign: f.callSign, time: f.at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) })}</Text>
                <Text style={type.small}>
                  {f.preset === SSTV_PRESET ? t('panel.sstvMeta') : t('listen.meta', { preset: f.preset, snr: f.snrDb.toFixed(1) })}
                  {f.corrected ? `, ${t('listen.corrected')}` : ''}
                </Text>
                {f.prayers ? f.prayers.map((p, i) => <Text key={i} style={type.body}>• {p}</Text>) : <Text style={type.body}>{t('listen.otherCodec', { codec: f.codec })}</Text>}
                {f.told ? <Text style={type.small}>{t('listen.told')}</Text> : null}
              </View>
            ))}
            <Text style={type.small}>{t('listen.tips')}</Text>
            <Text style={type.heading}>{t('listen.savedTitle')}</Text>
            {saved.length ? (
              <>
                <Text style={type.small}>{t('listen.savedHint', { count: saved.length })}</Text>
                {config.prayingToo ? <Text style={type.small}>{t('listen.prayingHint')}</Text> : null}
                {saved.map((p, i) => (
                  <View key={`${p.at}-${i}`} style={styles.card}>
                    <Text style={type.body}>{p.text}</Text>
                    <Text style={type.small}>{t('listen.savedFrom', { callSign: p.callSign, time: new Date(p.at).toLocaleString() })}</Text>
                    {features.signalQueue && p.hash && signalCode(p.hash) ? <Text style={type.small}>{t('signalQueue.listenCode', { code: signalCode(p.hash) })}</Text> : null}
                    {config.prayingToo && p.hash ? (
                      praying.has(p.hash) ? (
                        <Text style={type.small}>{t('listen.prayingDone')}</Text>
                      ) : (
                        <Button small variant="ghost" label={t('listen.prayingToo')} onPress={() => prayToo(p.callSign, p.hash!)} />
                      )
                    ) : null}
                  </View>
                ))}
                <Button small variant="ghost" label={t('listen.savedClear')} onPress={() => void clearHeard().then(() => setSaved([]))} />
              </>
            ) : (
              <Text style={type.small}>{t('listen.savedNone')}</Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: 80 },
  meter: { height: 10, borderRadius: radius.lg, backgroundColor: colors.border, overflow: 'hidden' },
  meterFill: { height: 10, backgroundColor: colors.primary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
});
