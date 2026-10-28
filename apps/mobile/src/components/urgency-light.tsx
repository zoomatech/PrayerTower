// The colored urgency light on a post card. With the "Glowing urgency light"
// switch on, an urgent (2) or very urgent (3) request's light glows and pulses;
// it stays still when the device asks for reduced motion.
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useFeatures } from '@/lib/features';
import { colors } from '@/lib/theme';

export function UrgencyLight({ urgency }: { urgency: number }) {
  const { urgencyGlow } = useFeatures();
  const color = colors.urgency[urgency as 0 | 1 | 2 | 3] ?? colors.urgency[0];
  const glows = urgencyGlow && urgency >= 2;
  const [pulse] = useState(() => new Animated.Value(0));
  const [still, setStill] = useState(true);

  useEffect(() => {
    if (!glows) return;
    let cancelled = false;
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled || reduce) return;
        setStill(false);
        const ms = urgency >= 3 ? 700 : 1100;
        const native = Platform.OS !== 'web';
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
            Animated.timing(pulse, { toValue: 0, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
          ]),
        );
        loop.start();
      });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [glows, urgency, pulse]);

  if (!glows) return <View style={[styles.light, { backgroundColor: color }]} />;
  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          styles.halo,
          { backgroundColor: color },
          still
            ? { opacity: 0.35 }
            : {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) }],
              },
        ]}
      />
      <View style={[styles.light, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  light: { width: 10, height: 10, borderRadius: 5 },
  wrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 20, height: 20, borderRadius: 10 },
});
