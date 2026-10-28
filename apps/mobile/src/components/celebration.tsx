// Thanksgiving celebration (notebook: "angelic wings cluster bomb"): a burst
// of winged hearts when a prayer is marked answered or a praise is posted.
// Skipped when the device asks for reduced motion. Counts and timing are
// placeholders.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useT } from '@/lib/i18n';

const PARTICLES = 18;
const DURATION_MS = 1600;
const GLYPHS = ['🕊️', '💜', '🤍', '✨', '💛'];

export function useCelebration() {
  const [runId, setRunId] = useState(0);
  const celebrate = useCallback(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!reduce) setRunId((n) => n + 1);
      });
  }, []);
  const overlay = runId ? <Burst key={runId} /> : null;
  return { celebrate, overlay };
}

function Burst() {
  const t = useT();
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  // Fixed per burst: each particle's direction, distance and glyph.
  const particles = useRef(
    Array.from({ length: PARTICLES }, (_, i) => {
      const angle = (i / PARTICLES) * Math.PI * 2 + Math.random() * 0.4;
      const distance = Math.min(width, height) * (0.25 + Math.random() * 0.2);
      return { dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - 60, glyph: GLYPHS[i % GLYPHS.length]!, size: 22 + Math.random() * 14 };
    }),
  ).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => setDone(true));
  }, [progress]);

  if (done) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.center}>
        {particles.map((p, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.particle,
              {
                fontSize: p.size,
                opacity: progress.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
                  { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
                  { scale: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.2, 0.9] }) },
                ],
              },
            ]}
          >
            {p.glyph}
          </Animated.Text>
        ))}
        <Animated.View style={{ opacity: progress.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] }) }}>
          <Text style={styles.word}>{t('common.praiseGod')}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute' },
  word: { fontSize: 28, fontWeight: '800', color: '#5B3F98', textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 8 },
});
