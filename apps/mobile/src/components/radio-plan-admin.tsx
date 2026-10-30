// Admin → Radio: the band plan (server radio/band-plan.ts) and urgent prayers (radio/urgent.ts),
// the operator console's band and urgent cards, and the "Send urgently" button on a request
// for admins and radio operators. Each is off by default.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Chip, Field } from '@/components/ui';
import { api, ApiError, type BandOutlook, type BandPlan, type RadioBand, type UrgentRadio } from '@/lib/api';
import { errorText } from '@/lib/error-report';
import { useT } from '@/lib/i18n';
import { colors, space, type } from '@/lib/theme';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const mhz = (hz: number) => (hz / 1e6).toFixed(hz < 30e6 ? 3 : 2);

/** "20 m, 14.103, usb, hf-standard" per line, to bands; null when a line doesn't read. */
export function parseBands(text: string): RadioBand[] | null {
  const bands: RadioBand[] = [];
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const [label, freq, mode, preset] = line.split(',').map((p) => p.trim());
    const freqHz = Math.round(Number(freq) * 1e6);
    if (!label || !Number.isFinite(freqHz) || freqHz < 500_000 || (mode !== 'fm' && mode !== 'usb')) return null;
    bands.push({ label, freqHz, mode, ...(preset ? { preset } : {}) });
  }
  return bands;
}

export const bandsText = (bands: RadioBand[]) => bands.map((b) => [b.label, mhz(b.freqHz), b.mode, b.preset].filter(Boolean).join(', ')).join('\n');

/** The bands the station may use; on HF the server picks one from NOAA space weather. */
export function BandPlanSection() {
  const t = useT();
  const [data, setData] = useState<BandPlan | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const show = (d: BandPlan) => {
    setData(d);
    setText(bandsText(d.bands));
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.bandPlan().then(show).catch((e) => setNote(errorText(e)));
    }, []),
  );
  if (!data) return note ? <Text style={type.small}>{note}</Text> : null;
  const save = (patch: { enabled?: boolean; bands?: RadioBand[] }) =>
    api.admin
      .updateBandPlan(patch)
      .then((d) => (show(d), setNote(null)))
      .catch((e) => setNote(errorText(e)));
  const saveBands = () => {
    const bands = parseBands(text);
    if (!bands) return setNote(t('bandPlan.badLine'));
    void save({ bands });
  };
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Chip label={t('bandPlan.off')} selected={!data.enabled} onPress={() => save({ enabled: false })} />
        <Chip label={t('bandPlan.on')} selected={data.enabled} onPress={() => save({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('bandPlan.hint')}</Text>
      {data.enabled ? (
        <>
          <Field label={t('bandPlan.bands')} value={text} onChangeText={setText} multiline autoCapitalize="none" autoCorrect={false} placeholder={'20 m, 14.103, usb\n2 m FM, 146.52, fm, fm-standard'} />
          <Button label={t('bandPlan.save')} variant="secondary" onPress={saveBands} />
          {data.outlook ? <BandOutlookCard outlook={data.outlook} /> : null}
        </>
      ) : null}
      {note ? <Text style={[type.small, { color: colors.danger }]}>{note}</Text> : null}
    </View>
  );
}

/** Now and the next hours: the band, the space weather it came from, and which hours may transmit. */
export function BandOutlookCard({ outlook }: { outlook: BandOutlook }) {
  const t = useT();
  const now = outlook.now;
  const w = outlook.spaceWeather;
  // Hours where the band changes, so the list stays short.
  const changes = outlook.hours.filter((h, i) => i === 0 || h.band !== outlook.hours[i - 1]!.band);
  return (
    <View style={{ gap: space.xs }}>
      {now ? (
        <Text style={[type.body, { fontWeight: '600' }]}>
          {t('bandPlan.now', { band: now.band.label, mhz: mhz(now.band.freqHz) })}
          {now.mufMhz ? ` · ${t('bandPlan.muf', { muf: now.mufMhz })}` : ''}
        </Text>
      ) : null}
      {w ? <Text style={type.small}>{t('bandPlan.weather', { sfi: w.sfi, kp: w.kp, at: time(w.fetchedAt) })}</Text> : <Text style={type.small}>{t('bandPlan.noWeather')}</Text>}
      {changes.slice(1, 7).map((h) => (
        <Text key={h.at} style={type.small}>
          {t('bandPlan.from', { time: time(h.at), band: h.band ?? '' })}
          {h.onAir ? '' : ` · ${t('bandPlan.offAir')}`}
        </Text>
      ))}
    </View>
  );
}

/** Urgent prayers: the switch, repeats and preset, and the last two days' urgent sends. */
export function UrgentRadioSection() {
  const t = useT();
  const [data, setData] = useState<UrgentRadio | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.urgentRadio().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const set = (patch: Parameters<typeof api.admin.updateUrgentRadio>[0]) => api.admin.updateUrgentRadio(patch).then(setData).catch(() => undefined);
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Chip label={t('urgentRadio.off')} selected={!data.enabled} onPress={() => set({ enabled: false })} />
        <Chip label={t('urgentRadio.on')} selected={data.enabled} onPress={() => set({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('urgentRadio.hint')}</Text>
      {data.enabled ? (
        <>
          <View style={styles.row}>
            {[2, 3, 5].map((n) => (
              <Chip key={n} label={t('urgentRadio.repeats', { count: n })} selected={data.repeats === n} onPress={() => set({ repeats: n })} />
            ))}
          </View>
          <View style={styles.row}>
            {['auto', 'fm-robust-fec', 'fm-robust', 'hf-robust'].map((p) => (
              <Chip key={p} label={p === 'auto' ? t('urgentRadio.autoPreset') : p} selected={data.preset === p} onPress={() => set({ preset: p })} />
            ))}
          </View>
          <UrgentList data={data} onChange={setData} />
        </>
      ) : null}
    </View>
  );
}

/** Each urgent send: waiting, sent, confirmed by a listener. Waiting ones can be unflagged. */
export function UrgentList({ data, onChange }: { data: UrgentRadio; onChange: (d: UrgentRadio) => void }) {
  const t = useT();
  return (
    <View style={{ gap: space.xs }}>
      {data.nextWindowAt ? <Text style={type.small}>{t('urgentRadio.nextWindow', { time: time(data.nextWindowAt), preset: data.presetNow ?? '' })}</Text> : null}
      {data.prayers.length === 0 ? <Text style={type.small}>{t('urgentRadio.none')}</Text> : null}
      {data.prayers.slice(0, 10).map((p) => (
        <View key={p.id} style={styles.item}>
          <Text style={type.body} numberOfLines={2}>
            {p.text}
          </Text>
          <Text style={type.small}>
            {p.confirmedAt
              ? t('urgentRadio.confirmed', { time: time(p.confirmedAt) })
              : p.status === 'transmitted'
                ? t('urgentRadio.sentWaiting', { time: time(p.transmittedAt!) })
                : t('urgentRadio.waiting')}
            {p.retries ? ` · ${t('urgentRadio.retries', { count: p.retries })}` : ''}
          </Text>
          {p.status === 'queued' ? <Button small variant="ghost" label={t('urgentRadio.unflag')} onPress={() => api.admin.unflagUrgent(p.id).then(onChange).catch(() => undefined)} /> : null}
        </View>
      ))}
    </View>
  );
}

/** On a request, for admins and radio operators, while urgent prayers are on: send it in the next window. */
export function UrgentRadioButton({ postId }: { postId: string }) {
  const t = useT();
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin
        .urgentRadio()
        .then((d) => setOn(d.enabled))
        .catch(() => setOn(false));
    }, []),
  );
  if (!on) return null;
  const flag = () =>
    api.admin
      .flagUrgent(postId)
      .then((r) => setNote(r.nextWindowAt ? t('urgentRadio.flagged', { time: time(r.nextWindowAt) }) : t('urgentRadio.flaggedNoWindow')))
      .catch((e) => setNote(e instanceof ApiError && e.status === 400 ? t('urgentRadio.cantSend') : errorText(e)));
  return (
    <View style={{ gap: space.xs }}>
      <Button variant="secondary" label={t('urgentRadio.send')} onPress={flag} />
      {note ? <Text style={type.small}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  item: { gap: space.xs, paddingVertical: space.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
