// The Believe moment (docs/GROWTH_PRACTICES.md): Ted Lasso's taped-up BELIEVE sign,
// shown when a prayer is answered. The person who asked is invited to share what
// happened; the people who prayed hear that their prayers mattered. It fades in
// unless Reduce Motion is on, and a screen reader reads it as one message.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

export function BelieveCard({ mine, onShare, onClose }: { mine: boolean; onShare?: () => void; onClose: () => void }) {
  const t = useT();
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) fade.setValue(1);
    else Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fade, reduced]);
  const message = mine ? t('practices.believeMine') : t('practices.believeTheirs');
  return (
    <Animated.View style={[styles.card, { opacity: fade }]} testID="believe-card" role="alert">
      <View style={styles.sign} accessible aria-label={`${t('practices.believeSign')}. ${message}`}>
        <Text style={styles.word} maxFontSizeMultiplier={1.6}>
          {t('practices.believeSign')}
        </Text>
      </View>
      <Text style={[type.body, styles.message]}>{message}</Text>
      <View style={styles.row}>
        {mine && onShare ? <Button small label={t('practices.believeShare')} onPress={onShare} /> : null}
        <Button small variant={mine && onShare ? 'secondary' : 'primary'} label={t('practices.believeClose')} onPress={onClose} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  // A sheet of paper taped slightly crooked above the office door.
  sign: { paddingVertical: space.sm, paddingHorizontal: space.lg, backgroundColor: '#FFF8D6', borderWidth: 1, borderColor: '#E5D27A', transform: [{ rotate: '-2deg' }] },
  word: { fontSize: 32, fontWeight: '800', letterSpacing: 4, color: '#1F3A93' },
  message: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' },
});
