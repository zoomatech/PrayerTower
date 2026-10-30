// Neon Circuit (beta, behind Admin → Feed skins): a sci-fi feed. Each request
// glows inside its own screen, turned a little to the left or right, and one
// live wire runs down the left edge with a short tap into each screen. Gentle
// bursts of light travel down the wire (Steve, 2026-10-29). Colors come from
// the theme's tokens (backdrop, wire, burst, screen). Reduced motion keeps the
// wire and stops the bursts.
import type { Card, FeedTheme } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';

import { CardFrame } from '@/components/post-card';
import { Tr, useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';
import { glow, isDark, textOn } from './motifs';

const SCREEN_INSET = 30;
const DEFAULTS = { backdrop: '#05070D', wire: '#00E5FF', burst: '#FFFFFF', screen: '#FF2BD6', tilt: 10 };
type CircuitTokens = typeof DEFAULTS;

export function circuitTokens(theme: FeedTheme | null): CircuitTokens {
  const t = (theme?.tokens ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULTS } as Record<string, unknown>;
  for (const [k, v] of Object.entries(DEFAULTS)) if (typeof t[k] === typeof v) out[k] = t[k];
  out.tilt = Math.min(Math.max(Number(out.tilt) || 0, 0), 20);
  return out as CircuitTokens;
}


/** A burst of light sliding down this row's piece of the wire, again and again. */
function Burst({ tokens, delay }: { tokens: CircuitTokens; delay: number }) {
  const [h, setH] = useState(0);
  const run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!h) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(run, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(run, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(1400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [h, run, delay]);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setH(e.nativeEvent.layout.height)} pointerEvents="none">
      <Animated.View
        style={[
          styles.burst,
          { backgroundColor: tokens.burst, ...glow(tokens.wire, 12) },
          { opacity: run.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: run.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(h - 18, 0)] }) }] },
        ]}
      />
    </View>
  );
}

function ScreenRow({ card, index, tokens, pinned, reduced, children }: { card: Card; index: number; tokens: CircuitTokens; pinned: boolean; reduced: boolean; children: React.ReactNode }) {
  const left = index % 2 === 0;
  // The post glows inside the screen; its action icons sit under it on the black, as neon tubes (Steve, 2026-10-30).
  const frame = useMemo(
    () => ({
      frame: (box: React.ReactNode) => (
        <View
          style={[
            styles.screen,
            { borderColor: tokens.screen, ...glow(tokens.screen, 18) },
            { transform: [{ perspective: 900 }, { rotateY: `${left ? tokens.tilt : -tokens.tilt}deg` }] },
          ]}>
          {pinned ? <Tr k="feed.pinned" style={[styles.pinned, { color: tokens.wire }]} /> : null}
          <View style={styles.tube}>
            <View style={styles.glass}>{box}</View>
          </View>
        </View>
      ),
      neon: { color: tokens.wire, active: tokens.screen },
      inset: SCREEN_INSET,
    }),
    [tokens, left, pinned],
  );
  return (
    <View style={styles.row} testID={`screen-${card.id}`}>
      {/* The wire, its tap into this screen, and the bursts on it. */}
      {/* Neon tubes: a white-hot core with the color blooming round it. */}
      <View style={[styles.wire, styles.core, { borderColor: tokens.wire, ...glow(tokens.wire, 12) }]}>{reduced ? null : <Burst tokens={tokens} delay={(index % 4) * 650} />}</View>
      <View style={[styles.tap, styles.core, { borderColor: tokens.wire, ...glow(tokens.wire, 12) }]} />
      <View style={[styles.node, { borderColor: tokens.wire, ...glow(tokens.wire, 8) }]} />
      <CardFrame.Provider value={frame}>{children}</CardFrame.Provider>
    </View>
  );
}

export function CircuitLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => circuitTokens(theme), [theme]);
  const reduced = useReducedMotion();
  return (
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="circuit-layout">
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ScreenRow card={item} index={index} tokens={tokens} pinned={item.id === pinnedId} reduced={reduced}>
            {renderCard(item)}
          </ScreenRow>
        )}
        ListHeaderComponent={header ? isDark(tokens.backdrop) ? <View style={styles.headerPanel}>{header}</View> : header : undefined}
        ListFooterComponent={
          atEnd && cards.length > 0 ? (
            <View style={styles.end}>
              <View style={[styles.endNode, { borderColor: tokens.wire, ...glow(tokens.wire, 10) }]} />
              <Text style={[type.small, { color: textOn(tokens.backdrop), textAlign: 'center' }]}>{t('circuit.end')}</Text>
            </View>
          ) : undefined
        }
        contentContainerStyle={styles.content}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        {...feedListTuning}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.md, paddingBottom: 120 },
  core: { backgroundColor: '#F2FEFF', borderWidth: 0.5 },
  // The screen's frame glows as a tube: its color outside, a thin bright line inside.
  tube: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', borderRadius: radius.md },
  headerPanel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm, marginBottom: space.md },
  row: { position: 'relative', paddingVertical: space.md },
  // The live wire runs down the left edge of every row, so together the rows form one line.
  wire: { position: 'absolute', left: 8, top: 0, bottom: 0, width: 2 },
  burst: { position: 'absolute', left: -3, width: 8, height: 18, borderRadius: 4 },
  tap: { position: 'absolute', top: '50%', left: 8, width: 22, height: 2 },
  node: { position: 'absolute', top: '50%', left: 3, marginTop: -6, width: 12, height: 12, borderRadius: 6, borderWidth: 2, backgroundColor: '#000' },
  screen: { marginLeft: SCREEN_INSET, borderWidth: 2, borderRadius: radius.md, padding: 5, backgroundColor: '#0E1220' },
  glass: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  pinned: { ...type.small, fontWeight: '700', marginBottom: 4 },
  end: { alignItems: 'center', gap: space.sm, paddingTop: space.md },
  endNode: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
