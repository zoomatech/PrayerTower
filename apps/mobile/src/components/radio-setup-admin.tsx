// Admin → Radio: the station setup wizard (server radio/setup.ts), the coverage map
// (radio/coverage.ts) and the weekly radio digest (radio/digest.ts). Each is off
// by default; docs/STATION_OPERATOR_GUIDE.md has the operator's side.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { Button, Chip, Field } from '@/components/ui';
import { api, type CoveragePoint, type RadioCoverage, type RadioDigest, type RadioSetup, type RadioSetupChoice, type RadioSetupTest } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const STATUS_POLL_MS = 3000;

/** Step by step: pick the radio, set levels with a test tone, send a test burst, see it decoded. */
export function RadioSetupSection() {
  const t = useT();
  const [data, setData] = useState<RadioSetup | null>(null);
  const [draft, setDraft] = useState({ port: '', speed: '', model: '', freq: '' });
  const [note, setNote] = useState<string | null>(null);
  const show = (d: RadioSetup) => {
    setData(d);
    setDraft({ port: d.choice.port ?? '', speed: d.choice.speed ? String(d.choice.speed) : '', model: d.choice.model ? String(d.choice.model) : '', freq: d.choice.frequencyHz ? String(d.choice.frequencyHz / 1e6) : '' });
  };
  const load = useCallback(() => api.admin.radioSetup().then(show).catch((e) => setNote((e as Error).message)), []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  // While a test is on its way, refresh until it is heard or fails.
  const open = data?.tests.some((x) => x.status === 'requested' || x.status === 'sending' || x.status === 'sent');
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => api.admin.radioSetup().then(setData).catch(() => undefined), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [open]);
  if (!data) return note ? <Text style={type.small}>{note}</Text> : null;
  const save = (patch: { enabled?: boolean; choice?: RadioSetupChoice }) =>
    api.admin
      .updateRadioSetup(patch)
      .then((d) => (show(d), setNote(null)))
      .catch((e) => setNote((e as Error).message));
  const saveDetails = () => {
    const mhz = Number.parseFloat(draft.freq);
    save({
      choice: {
        port: draft.port.trim(),
        ...(draft.speed ? { speed: Number.parseInt(draft.speed, 10) } : {}),
        ...(draft.model ? { model: Number.parseInt(draft.model, 10) } : {}),
        ...(Number.isFinite(mhz) && mhz > 0 ? { frequencyHz: Math.round(mhz * 1e6) } : {}),
      },
    });
  };
  const run = (kind: RadioSetupTest['kind']) =>
    api.admin
      .requestSetupTest(kind)
      .then(() => (setNote(null), load()))
      .catch((e) => setNote((e as Error).message));
  const latest = (kind: RadioSetupTest['kind']) => data.tests.find((x) => x.kind === kind);
  const c = data.choice;
  const cat = !!c.rig && !['vox', 'ptt-only'].includes(c.rig);
  const lines = [
    ...(data.env.rigctld.length ? ['# /etc/prayer-tower-rigctld.env', ...data.env.rigctld, ''] : []),
    '# /etc/prayer-tower-station.env',
    ...data.env.station,
  ].join('\n');
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Chip label={t('radioSetup.off')} selected={!data.enabled} onPress={() => save({ enabled: false })} />
        <Chip label={t('radioSetup.on')} selected={data.enabled} onPress={() => save({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('radioSetup.hint')}</Text>
      {data.enabled ? (
        <>
          <Text style={styles.step}>{t('radioSetup.step1')}</Text>
          <View style={styles.row}>
            {data.rigs.map((r) => (
              <Chip key={r.id} radio label={r.label} selected={c.rig === r.id} onPress={() => save({ choice: { rig: r.id } })} />
            ))}
          </View>
          <View style={styles.row}>
            <Chip radio label={t('radioSetup.bandFm')} selected={c.band !== 'hf'} onPress={() => save({ choice: { band: 'fm' } })} />
            <Chip radio label={t('radioSetup.bandHf')} selected={c.band === 'hf'} onPress={() => save({ choice: { band: 'hf' } })} />
          </View>
          {c.rig === 'other' ? <Field label={t('radioSetup.model')} keyboardType="number-pad" value={draft.model} onChangeText={(v) => setDraft({ ...draft, model: v })} /> : null}
          {c.rig && c.rig !== 'vox' ? (
            <Field label={t('radioSetup.port')} autoCapitalize="none" autoCorrect={false} placeholder="/dev/serial/by-id/usb-…" value={draft.port} onChangeText={(v) => setDraft({ ...draft, port: v })} />
          ) : null}
          {cat ? <Field label={t('radioSetup.speed')} keyboardType="number-pad" placeholder="19200" value={draft.speed} onChangeText={(v) => setDraft({ ...draft, speed: v })} /> : null}
          <Field label={t('radioSetup.freq')} keyboardType="decimal-pad" placeholder={c.band === 'hf' ? '14.1' : '146.55'} value={draft.freq} onChangeText={(v) => setDraft({ ...draft, freq: v })} />
          <Button label={t('radioSetup.saveDetails')} variant="secondary" onPress={saveDetails} />
          <Text style={type.small}>{t('radioSetup.envHint')}</Text>
          <Text selectable style={styles.code}>
            {lines}
          </Text>
          <Button label={t('radioSetup.shareEnv')} variant="ghost" onPress={() => void Share.share({ message: lines })} />
          {data.checks.length ? (
            data.checks.map((s) => (
              <View key={s.call_sign}>
                <Text style={type.small}>{t('radioSetup.checksFrom', { call: s.call_sign, time: new Date(s.reported_at).toLocaleTimeString() })}</Text>
                {s.checks.map((k) => (
                  <Text key={k.name} style={[type.small, { color: k.ok ? colors.text : colors.danger }]}>
                    {k.ok ? '✓' : '✗'} {k.name}: {k.detail}
                  </Text>
                ))}
              </View>
            ))
          ) : (
            <Text style={type.small}>{t('radioSetup.noChecks')}</Text>
          )}

          <Text style={styles.step}>{t('radioSetup.step2')}</Text>
          <Text style={type.small}>{t('radioSetup.toneHint')}</Text>
          <Button label={t('radioSetup.playTone')} variant="secondary" disabled={open} onPress={() => run('tone')} />
          <TestLine test={latest('tone')} />

          <Text style={styles.step}>{t('radioSetup.step3')}</Text>
          <Text style={type.small}>{t('radioSetup.burstHint')}</Text>
          <Button label={t('radioSetup.sendBurst')} variant="secondary" disabled={open} onPress={() => run('burst')} />
          <TestLine test={latest('burst')} />

          <Text style={styles.step}>{t('radioSetup.step4')}</Text>
          <DecodeLine test={latest('burst')} onConfirm={(id) => api.admin.confirmSetupTest(id).then(load).catch((e) => setNote((e as Error).message))} />
        </>
      ) : null}
      {note ? <Text style={[type.small, { color: colors.danger }]}>{note}</Text> : null}
    </View>
  );
}

function TestLine({ test }: { test: RadioSetupTest | undefined }) {
  const t = useT();
  if (!test) return null;
  const status = t(`radioSetup.status.${test.status}`);
  const level = test.kind === 'tone' && test.peak_dbfs !== null ? ` ${t('radioSetup.played', { db: test.peak_dbfs })}` : '';
  return (
    <Text accessibilityLiveRegion="polite" style={[type.small, test.status === 'failed' && { color: colors.danger }]}>
      {status}
      {level}
      {test.error ? ` ${test.error}` : ''}
    </Text>
  );
}

function DecodeLine({ test, onConfirm }: { test: RadioSetupTest | undefined; onConfirm: (id: string) => void }) {
  const t = useT();
  if (!test || test.status === 'requested' || test.status === 'sending') return <Text style={type.small}>{t('radioSetup.decodeWaiting')}</Text>;
  if (test.status === 'heard') {
    return (
      <View accessibilityLiveRegion="polite">
        <Text style={[type.body, { color: colors.primary }]}>{t('radioSetup.decoded', { by: test.heard_by ?? '' })}</Text>
        {test.heard_snr_db !== null ? <Text style={type.small}>{t('radioSetup.signal', { db: test.heard_snr_db })}</Text> : null}
        {test.advice ? <Text style={type.small}>{t(`radioSetup.advice.${test.advice}`, { db: test.heard_peak_dbfs ?? 0 })}</Text> : null}
        <Text style={type.small}>{t('radioSetup.done')}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.small}>{test.status === 'sent' ? t('radioSetup.decodeListening') : t('radioSetup.decodeNone')}</Text>
      {test.sent_at ? <Button label={t('radioSetup.confirm')} variant="ghost" onPress={() => onConfirm(test.id)} /> : null}
    </View>
  );
}

// Web Mercator, the projection map tiles use: x and y in 256 px tiles at zoom z.
const TILE = 256;
const project = (lat: number, lon: number, z: number) => {
  const n = 2 ** z * TILE;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
const QUALITY_COLOR: Record<CoveragePoint['quality'], string> = { strong: '#2e7d32', fair: '#f9a825', weak: '#c62828', none: '#9e9e9e' };

/** Placed listener nodes and the station on a small map (tiles when an admin set a tile server, else a grid). */
export function CoverageMap({ data, width, height = 240 }: { data: RadioCoverage; width: number; height?: number }) {
  const t = useT();
  const spots = [...data.points.map((p) => ({ lat: p.lat, lon: p.lon })), ...(data.station ? [data.station] : [])];
  if (!spots.length || width <= 0) return null;
  // The closest zoom (up to 11, about a city) that fits every spot with a margin.
  let z = 11;
  for (; z > 1; z--) {
    const ps = spots.map((s) => project(s.lat, s.lon, z));
    const w = Math.max(...ps.map((p) => p.x)) - Math.min(...ps.map((p) => p.x));
    const h = Math.max(...ps.map((p) => p.y)) - Math.min(...ps.map((p) => p.y));
    if (w <= width - 60 && h <= height - 60) break;
  }
  const ps = spots.map((s) => project(s.lat, s.lon, z));
  const cx = (Math.max(...ps.map((p) => p.x)) + Math.min(...ps.map((p) => p.x))) / 2;
  const cy = (Math.max(...ps.map((p) => p.y)) + Math.min(...ps.map((p) => p.y))) / 2;
  const left = cx - width / 2;
  const top = cy - height / 2;
  const at = (lat: number, lon: number) => {
    const p = project(lat, lon, z);
    return { x: p.x - left, y: p.y - top };
  };
  const tiles: { key: string; x: number; y: number; uri: string }[] = [];
  const max = 2 ** z;
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
      if (ty < 0 || ty >= max) continue;
      const wx = ((tx % max) + max) % max;
      const uri = data.tileUrl ? data.tileUrl.replace('{z}', String(z)).replace('{x}', String(wx)).replace('{y}', String(ty)) : '';
      tiles.push({ key: `${tx}/${ty}`, x: tx * TILE - left, y: ty * TILE - top, uri });
    }
  }
  // OpenStreetMap's own tile servers need their credit line under the map.
  const host = /^https:\/\/([^/:?#]+)/i.exec(data.tileUrl)?.[1]?.toLowerCase() ?? '';
  const osm = host === 'openstreetmap.org' || host.endsWith('.openstreetmap.org');
  return (
    <View>
      <View style={[styles.map, { width, height }]} accessibilityRole="image" accessibilityLabel={t('coverage.mapLabel', { count: data.points.length })}>
        {tiles.map((tile) =>
          tile.uri ? (
            <Image
              key={tile.key}
              source={{ uri: tile.uri, headers: { 'User-Agent': 'PrayerTowerAdmin/1.0 (coverage map)' } }}
              style={{ position: 'absolute', left: tile.x, top: tile.y, width: TILE, height: TILE }}
            />
          ) : null,
        )}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {!data.tileUrl
            ? tiles.flatMap((tile) => [
                <Line key={`v${tile.key}`} x1={tile.x} y1={0} x2={tile.x} y2={height} stroke={colors.border} strokeWidth={1} />,
                <Line key={`h${tile.key}`} x1={0} y1={tile.y} x2={width} y2={tile.y} stroke={colors.border} strokeWidth={1} />,
              ])
            : null}
          {data.station
            ? (() => {
                const s = at(data.station.lat, data.station.lon);
                const star = Array.from({ length: 10 }, (_, i) => {
                  const r = i % 2 ? 4 : 10;
                  const a = (Math.PI * i) / 5 - Math.PI / 2;
                  return `${s.x + r * Math.cos(a)},${s.y + r * Math.sin(a)}`;
                }).join(' ');
                return <Polygon points={star} fill={colors.primary} stroke="#fff" strokeWidth={1.5} />;
              })()
            : null}
          {data.points.map((p) => {
            const s = at(p.lat, p.lon);
            return [
              <Circle key={`c${p.id}`} cx={s.x} cy={s.y} r={8} fill={QUALITY_COLOR[p.quality]} stroke="#fff" strokeWidth={2} />,
              <SvgText key={`t${p.id}`} x={s.x + 11} y={s.y + 4} fontSize={11} fill={colors.text} stroke="#fff" strokeWidth={0.4}>
                {p.place ?? p.name}
              </SvgText>,
            ];
          })}
        </Svg>
      </View>
      {osm ? <Text style={type.small}>{t('coverage.osm')}</Text> : null}
    </View>
  );
}

export function CoverageSection() {
  const t = useT();
  const [data, setData] = useState<RadioCoverage | null>(null);
  const [width, setWidth] = useState(0);
  const [tileUrl, setTileUrl] = useState('');
  const [station, setStation] = useState('');
  const [placing, setPlacing] = useState<{ id: string; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const show = (d: RadioCoverage) => {
    setData(d);
    setTileUrl(d.tileUrl);
    setStation(d.station ? `${d.station.lat}, ${d.station.lon}` : '');
  };
  useFocusEffect(
    useCallback(() => {
      api.admin.radioCoverage().then(show).catch((e) => setNote((e as Error).message));
    }, []),
  );
  if (!data) return note ? <Text style={type.small}>{note}</Text> : null;
  const done = (p: Promise<RadioCoverage>) => p.then((d) => (show(d), setNote(null), setPlacing(null))).catch((e) => setNote((e as Error).message));
  /** "lat, lon" or "lat, lon, Place". */
  const parse = (text: string) => {
    const [la, lo, ...rest] = text.split(',');
    const lat = Number(la), lon = Number(lo);
    if (!la?.trim() || !lo?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const place = rest.join(',').trim();
    return { lat, lon, ...(place ? { place } : {}) };
  };
  const saveStation = () => {
    if (!station.trim()) return done(api.admin.updateRadioCoverage({ station: null, tileUrl: tileUrl.trim() }));
    const loc = parse(station);
    if (!loc) return setNote(t('coverage.badLocation'));
    done(api.admin.updateRadioCoverage({ station: { lat: loc.lat, lon: loc.lon }, tileUrl: tileUrl.trim() }));
  };
  const savePlace = () => {
    if (!placing) return;
    if (!placing.text.trim()) return done(api.admin.placeRadioNode(placing.id, null));
    const loc = parse(placing.text);
    if (!loc) return setNote(t('coverage.badLocation'));
    done(api.admin.placeRadioNode(placing.id, loc));
  };
  return (
    <View style={{ gap: space.sm }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.row}>
        <Chip label={t('coverage.off')} selected={!data.enabled} onPress={() => done(api.admin.updateRadioCoverage({ enabled: false }))} />
        <Chip label={t('coverage.on')} selected={data.enabled} onPress={() => done(api.admin.updateRadioCoverage({ enabled: true }))} />
      </View>
      <Text style={type.small}>{t('coverage.hint')}</Text>
      {data.enabled ? (
        <>
          {data.points.length || data.station ? <CoverageMap data={data} width={width} /> : <Text style={type.small}>{t('coverage.empty')}</Text>}
          <View style={styles.row}>
            {(['strong', 'fair', 'weak', 'none'] as const).map((q) => (
              <Text key={q} style={type.small}>
                <Text style={{ color: QUALITY_COLOR[q] }}>●</Text> {t(`coverage.quality.${q}`)}
              </Text>
            ))}
          </View>
          {data.points.map((p) => (
            <Text key={p.id} style={type.small}>
              {p.name}
              {p.place ? ` (${p.place})` : ''}: {p.snrDb === null ? t('coverage.heardNothing') : t('coverage.heard', { db: p.snrDb, count: p.reports })}
            </Text>
          ))}
          {[...data.points.map((p) => ({ id: p.id, name: p.name, placed: true })), ...data.unplaced.map((u) => ({ ...u, placed: false }))].map((n) =>
            placing?.id === n.id ? (
              <View key={n.id} style={{ gap: space.xs }}>
                <Field label={t('coverage.placeLabel', { name: n.name })} placeholder="39.8, -89.6, Springfield" value={placing.text} onChangeText={(v) => setPlacing({ id: n.id, text: v })} />
                <Button label={t('coverage.savePlace')} variant="secondary" onPress={savePlace} />
              </View>
            ) : (
              <Button key={n.id} label={n.placed ? t('coverage.move', { name: n.name }) : t('coverage.place', { name: n.name })} variant="ghost" onPress={() => setPlacing({ id: n.id, text: '' })} />
            ),
          )}
          <Field label={t('coverage.station')} placeholder="40.1, -88.2" value={station} onChangeText={setStation} />
          <Field label={t('coverage.tiles')} autoCapitalize="none" autoCorrect={false} placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png" value={tileUrl} onChangeText={setTileUrl} />
          <Text style={type.small}>{t('coverage.tilesHint')}</Text>
          <Button label={t('coverage.save')} variant="secondary" onPress={saveStation} />
        </>
      ) : null}
      {note ? <Text style={[type.small, { color: colors.danger }]}>{note}</Text> : null}
    </View>
  );
}

export function RadioDigestSection() {
  const t = useT();
  const [data, setData] = useState<RadioDigest | null>(null);
  useFocusEffect(
    useCallback(() => {
      api.admin.radioDigest().then(setData).catch(() => undefined);
    }, []),
  );
  if (!data) return null;
  const set = (patch: { enabled?: boolean; email?: boolean }) => api.admin.updateRadioDigest(patch).then(setData).catch(() => undefined);
  const weeks = [...data.weeks].reverse();
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.row}>
        <Chip label={t('radioDigest.off')} selected={!data.enabled} onPress={() => set({ enabled: false })} />
        <Chip label={t('radioDigest.on')} selected={data.enabled} onPress={() => set({ enabled: true })} />
      </View>
      <Text style={type.small}>{t('radioDigest.hint')}</Text>
      {data.enabled ? (
        <>
          <View style={styles.row}>
            <Chip label={t('radioDigest.emailOff')} selected={!data.email} onPress={() => set({ email: false })} />
            <Chip label={t('radioDigest.emailOn')} selected={data.email} onPress={() => set({ email: true })} />
          </View>
          <View style={styles.tableRow}>
            {(['week', 'aired', 'heard', 'answered'] as const).map((k) => (
              <Text key={k} style={[type.small, styles.cell, k === 'week' && styles.first]}>
                {t(`radioDigest.${k}`)}
              </Text>
            ))}
          </View>
          {weeks.map((w, i) => (
            <View key={w.week_start} style={styles.tableRow} accessible accessibilityLabel={t('radioDigest.rowLabel', { week: w.week_start, aired: w.aired, heard: w.heard, answered: w.answered })}>
              <Text style={[type.small, styles.cell, styles.first]}>{i === 0 ? t('radioDigest.thisWeek') : w.week_start}</Text>
              <Text style={[type.small, styles.cell]}>{w.aired}</Text>
              <Text style={[type.small, styles.cell]}>{w.heard}</Text>
              <Text style={[type.small, styles.cell]}>{w.answered}</Text>
            </View>
          ))}
          {weeks[1] ? <Text style={type.small}>{t('radioDigest.extra', { thanks: weeks[1].thanksgiving, praying: weeks[1].praying_too, failed: weeks[1].failed })}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  step: { ...type.body, fontWeight: '600', marginTop: space.sm },
  code: { fontFamily: 'Menlo', fontSize: 12, backgroundColor: colors.background, borderRadius: radius.sm, padding: space.sm, color: colors.text },
  map: { overflow: 'hidden', borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tableRow: { flexDirection: 'row', gap: space.sm },
  cell: { flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  first: { flex: 2, textAlign: 'left' },
});
