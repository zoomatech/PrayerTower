// Signal journey (docs/STATION_OPERATOR_GUIDE.md, "Signal journey"), from the HAM Operators notebook
// page: "dots of prayer float from earth ... the line of the radio waves journey through
// space", and the radio-tower dashboard idea of "light-years reached". For one radio prayer
// that went out: how far its wave front is from Earth now (light travel time since it was
// sent), the places it has passed, the next one, and the strongest receiver report. The
// track is on a log scale, Earth on the left and Proxima Centauri on the right; dots drift
// out along it unless Reduce Motion is on. Off with the admin's switch.
import { JOURNEY_LANDMARKS, signalJourney, type JourneyLandmark } from '@prayer-tower/shared';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useT, type T } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

const MIN_LOG = 3; // 1,000 km, about where the track starts
const MAX_LOG = Math.log10(JOURNEY_LANDMARKS[JOURNEY_LANDMARKS.length - 1]!.km);
/** Where a distance sits on the track, 0 (Earth) to 1 (the last landmark). */
export const trackAt = (km: number) => Math.min(1, Math.max(0, (Math.log10(Math.max(km, 10 ** MIN_LOG)) - MIN_LOG) / (MAX_LOG - MIN_LOG)));

/** "384,400", "2.6 billion". */
export function bigKm(km: number, t: T): string {
  const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-US');
  if (km >= 1e12) return t('signalQueue.journey.big.trillion', { n: n(km / 1e12) });
  if (km >= 1e9) return t('signalQueue.journey.big.billion', { n: n(km / 1e9) });
  if (km >= 1e6) return t('signalQueue.journey.big.million', { n: n(km / 1e6) });
  return Math.round(km).toLocaleString('en-US');
}

/** "42 s", "3.2 h", "12 days". */
export function shortTime(seconds: number, t: T): string {
  const units = [
    ['year', 365.25 * 86_400],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ] as const;
  const [unit, size] = units.find(([, s]) => seconds >= s) ?? units[units.length - 1]!;
  const count = seconds / size >= 10 ? Math.round(seconds / size) : Math.round((seconds / size) * 10) / 10;
  return t(`signalQueue.journey.time.${unit}`, { count });
}

const place = (t: T, key: JourneyLandmark) => t(`signalQueue.journey.place.${key}`);

export function SignalJourney({ sentAt, bestSnrDb, now: fixedNow }: { sentAt: string; bestSnrDb?: number | null; now?: number }) {
  const t = useT();
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => fixedNow ?? Date.now());
  // Light covers 300,000 km a second: the numbers keep moving while the screen is open.
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fixedNow]);
  const j = signalJourney(Date.parse(sentAt), now);
  const at = trackAt(j.km);

  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.timing(drift, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [drift, reduced]);
  const [width, setWidth] = useState(0);
  const front = at * width;

  return (
    <View style={styles.box}>
      <Text style={type.heading}>{t('signalQueue.journey.title')}</Text>
      <Text style={type.body}>
        {t('signalQueue.journey.now', {
          value: j.light.value.toLocaleString('en-US'),
          unit: t(`signalQueue.journey.unit.${j.light.unit}`, { count: j.light.value }),
          km: bigKm(j.km, t),
        })}
      </Text>
      <View
        style={styles.track}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          j.next
            ? t('signalQueue.journey.pictureLabel', { percent: Math.round(j.next.fraction * 100), place: place(t, j.next.key) })
            : t('signalQueue.journey.beyond')
        }
      >
        <View style={styles.line} />
        <View style={[styles.trail, { width: front }]} />
        {JOURNEY_LANDMARKS.map((l) => (
          <View key={l.key} testID={`journey-mark-${l.key}`} style={[styles.mark, { left: trackAt(l.km) * width - 3 }, j.passed.includes(l.key) && styles.markPassed]} />
        ))}
        <View style={[styles.earth, { left: -6 }]} />
        {[0, 1, 2].map((i) =>
          reduced ? null : (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  opacity: drift.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
                  transform: [{ translateX: Animated.multiply(Animated.modulo(Animated.add(drift, i / 3), 1), front) }],
                },
              ]}
            />
          ),
        )}
        <View testID="journey-front" style={[styles.front, { left: front - 5 }]} />
      </View>
      {j.passed.length ? <Text style={type.small}>{t('signalQueue.journey.passed', { places: j.passed.map((k) => place(t, k)).join(', ') })}</Text> : null}
      <Text style={type.small}>
        {j.next ? t('signalQueue.journey.next', { place: place(t, j.next.key), time: shortTime(j.next.inSeconds, t) }) : t('signalQueue.journey.beyond')}
      </Text>
      {typeof bestSnrDb === 'number' ? <Text style={type.small}>{t('signalQueue.journey.strongest', { snr: bestSnrDb })}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  track: { height: 24, justifyContent: 'center', marginHorizontal: space.sm },
  line: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.border },
  trail: { position: 'absolute', left: 0, height: 2, backgroundColor: colors.primary },
  mark: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  markPassed: { backgroundColor: colors.primary },
  earth: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  dot: { position: 'absolute', left: 0, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  front: { position: 'absolute', width: 10, height: 10, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface },
});
