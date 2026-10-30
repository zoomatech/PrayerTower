// Sparkling lights riding the neon (Steve, 2026-10-30): now and then, at random, a bright
// point of light runs along one of a drawing's glass tubes and fades. Give it the tube's
// straight runs, in its parent's coordinates. Reduced motion shows none.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/lib/motion';

import { tubeShades } from './glass-tube';

export type Run = { x1: number; y1: number; x2: number; y2: number };

const SIZE = 7;

/** The four sides of a rectangle, clockwise, inset by `e`: the runs of a box's tube. */
export function boxRuns(w: number, h: number, e: number): Run[] {
  return [
    { x1: e, y1: e, x2: w - e, y2: e },
    { x1: w - e, y1: e, x2: w - e, y2: h - e },
    { x1: w - e, y1: h - e, x2: e, y2: h - e },
    { x1: e, y1: h - e, x2: e, y2: e },
  ];
}

export function Sparkles({ runs, color }: { runs: Run[]; color: string }) {
  const reduced = useReducedMotion();
  const ride = useRef(new Animated.Value(0)).current;
  const [run, setRun] = useState<Run | null>(null);
  const key = runs.map((r) => `${r.x1},${r.y1},${r.x2},${r.y2}`).join(';');
  useEffect(() => {
    if (reduced || !runs.length) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      // Rest a random while, then ride a random run.
      timer = setTimeout(() => {
        if (!live) return;
        const r = runs[Math.floor(Math.random() * runs.length)]!;
        const len = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
        setRun(r);
        ride.setValue(0);
        Animated.timing(ride, { toValue: 1, duration: Math.max(500, len * 6), easing: Easing.inOut(Easing.sin), useNativeDriver: true }).start(() => live && next());
      }, 700 + Math.random() * 3800);
    };
    next();
    return () => {
      live = false;
      clearTimeout(timer);
      ride.stopAnimation();
    };
  }, [key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  if (reduced || !run) return null;
  const light = tubeShades(color);
  return (
    <View style={styles.fill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.spark,
          { backgroundColor: light.core, shadowColor: color },
          {
            opacity: ride.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: ride.interpolate({ inputRange: [0, 1], outputRange: [run.x1 - SIZE / 2, run.x2 - SIZE / 2] }) },
              { translateY: ride.interpolate({ inputRange: [0, 1], outputRange: [run.y1 - SIZE / 2, run.y2 - SIZE / 2] }) },
              // A twinkle as it goes.
              { scale: ride.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0.6, 1.3, 0.8, 1.4, 0.6] }) },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'visible' },
  spark: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, borderRadius: SIZE / 2, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
});
