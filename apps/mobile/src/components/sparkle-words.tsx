// Animated long-post preview: under a truncated request, its important words
// sparkle in one by one, so a reader sees what the whole request is about.
// Static (no animation) when the device asks for reduced motion.
import { importantWords } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { colors, space, type } from '@/lib/theme';

const STAGGER_MS = 350;

export function SparkleWords({ body }: { body: string }) {
  const words = useMemo(() => importantWords(body), [body]);
  const [still, setStill] = useState(false);
  const values = useRef(words.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          setStill(true);
          return;
        }
        Animated.stagger(
          STAGGER_MS,
          values.map((v) => Animated.spring(v, { toValue: 1, friction: 5, useNativeDriver: Platform.OS !== 'web' })),
        ).start();
      });
    return () => {
      cancelled = true;
    };
  }, [values]);

  if (words.length < 2) return null;
  return (
    <View style={styles.row} accessibilityLabel={`Key words: ${words.join(', ')}`}>
      <Text style={styles.spark}>✨</Text>
      {words.map((w, i) => (
        <Animated.View
          key={w}
          style={
            still
              ? undefined
              : {
                  opacity: values[i],
                  transform: [{ scale: values[i]!.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
                }
          }
        >
          <Text style={styles.word}>{w}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  spark: { ...type.small },
  word: { ...type.small, color: colors.primary, fontWeight: '700', backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
});
