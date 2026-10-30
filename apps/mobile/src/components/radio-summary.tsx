// "Sent by radio at 9:30 PM, heard by 4 listeners" (server radio/followup.ts), for the member
// who sent a radio prayer and the person who asked, with a small map of the listener nodes that
// heard it (placed nodes only, about a city; phones are only counted) and the member's own
// choice of one notice per send. Off with the admin's switch.
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { Toggle } from '@/components/ui';
import { api, type RadioLoop, type RadioPrefs, type RadioSummary } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { colors, radius, space, type } from '@/lib/theme';

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

type Spot = { name: string; lat: number; lon: number; station?: boolean };

/** Where the spots sit in a w × h box, flat (lon across, lat up), with room around them. */
export function layout(spots: Spot[], w: number, h: number, pad = 18) {
  const lats = spots.map((s) => s.lat);
  const lons = spots.map((s) => s.lon);
  // At least about 20 km across, so one or two close spots don't fill the box.
  const span = Math.max(0.2, Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const midLon = (Math.max(...lons) + Math.min(...lons)) / 2;
  const scale = Math.min(w - 2 * pad, h - 2 * pad) / span;
  return spots.map((s) => ({ ...s, x: w / 2 + (s.lon - midLon) * scale, y: h / 2 - (s.lat - midLat) * scale }));
}

export function HeardMap({ summary, label }: { summary: RadioSummary; label: string }) {
  const places = summary.latest?.places ?? [];
  if (!places.length) return null;
  const W = 280;
  const H = 150;
  const spots = layout([...(summary.station ? [{ name: '', ...summary.station, station: true }] : []), ...places], W, H);
  const st = spots.find((s) => s.station);
  return (
    <View accessible accessibilityLabel={label} style={styles.map}>
      <Svg width={W} height={H} aria-hidden>
        {st ? spots.filter((s) => !s.station).map((s) => <Line key={`l-${s.name}`} x1={st.x} y1={st.y} x2={s.x} y2={s.y} stroke={colors.border} strokeWidth={1} />) : null}
        {spots.map((s) =>
          s.station ? (
            <Circle key="station" cx={s.x} cy={s.y} r={6} fill={colors.primary} />
          ) : (
            <Circle key={s.name} cx={s.x} cy={s.y} r={5} fill={colors.surface} stroke={colors.primary} strokeWidth={2} />
          ),
        )}
        {spots
          .filter((s) => !s.station)
          .map((s) => (
            <SvgText key={`t-${s.name}`} x={s.x + 8} y={s.y + 4} fontSize={11} fill={colors.text}>
              {s.name}
            </SvgText>
          ))}
      </Svg>
    </View>
  );
}

export function RadioSummaryCard({ postId }: { postId: string }) {
  const t = useT();
  const [summary, setSummary] = useState<RadioSummary | null>(null);
  const load = useCallback(() => api.radioSummary(postId).then(setSummary, () => setSummary(null)), [postId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!summary?.latest) return null;
  const l = summary.latest;
  const notify = (on: boolean) => api.updateRadioPrefs({ followup: on }).then(load, () => undefined);
  return (
    <View style={styles.box} testID="radio-summary">
      <Text style={type.heading}>{t('radioFollowup.title')}</Text>
      <Text style={type.body}>
        {l.heardBy ? t('radioFollowup.heard', { time: time(l.sentAt), count: l.heardBy }) : t('radioFollowup.notYet', { time: time(l.sentAt) })}
      </Text>
      {summary.sends > 1 ? <Text style={type.small}>{t('radioFollowup.sends', { count: summary.sends })}</Text> : null}
      <HeardMap summary={summary} label={t('radioFollowup.mapLabel', { places: l.places.map((p) => p.name).join(', ') })} />
      <Toggle label={t('radioFollowup.notify')} hint={t('radioFollowup.notifyHint')} value={summary.optedIn} onChange={notify} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.xs, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm },
  map: { alignSelf: 'flex-start', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
});

/** Admin → Radio → Members and listeners: the follow-up, reading aloud, and name privacy. */
export function RadioLoopSection() {
  const t = useT();
  const [s, setS] = useState<RadioLoop | null>(null);
  useEffect(() => {
    api.admin.radioLoop().then(setS, () => undefined);
  }, []);
  if (!s) return null;
  const set = (patch: Partial<RadioLoop>) => api.admin.updateRadioLoop(patch).then(setS, () => undefined);
  return (
    <View style={{ gap: space.sm }}>
      <Toggle label={t('radioFollowup.adminOn')} hint={t('radioFollowup.adminHint')} value={s.followup} onChange={(v) => set({ followup: v })} />
      <Toggle label={t('readAloud.adminOn')} hint={t('readAloud.adminHint')} value={s.readAloud} onChange={(v) => set({ readAloud: v })} />
      <Toggle label={t('namePrivacy.adminOn')} hint={t('namePrivacy.adminHint')} value={s.namePrivacy} onChange={(v) => set({ namePrivacy: v })} />
    </View>
  );
}

/** Me → Notification settings: one notice per radio send, and names off the radio. Each only while its switch is on. */
export function RadioPrefsSection() {
  const t = useT();
  const [p, setP] = useState<RadioPrefs | null>(null);
  useEffect(() => {
    api.radioPrefs().then(setP, () => undefined);
  }, []);
  if (!p || (p.followup === null && p.namesPrivate === null)) return null;
  const set = (patch: { followup?: boolean; namesPrivate?: boolean }) => api.updateRadioPrefs(patch).then(setP, () => undefined);
  return (
    <>
      {p.followup !== null ? <Toggle label={t('radioFollowup.notify')} hint={t('radioFollowup.notifyHint')} value={p.followup} onChange={(v) => set({ followup: v })} /> : null}
      {p.namesPrivate !== null ? <Toggle label={t('namePrivacy.mine')} hint={t('namePrivacy.mineHint')} value={p.namesPrivate} onChange={(v) => set({ namesPrivate: v })} /> : null}
    </>
  );
}
