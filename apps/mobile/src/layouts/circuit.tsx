// Neon Circuit (beta, behind Admin → Feed skins): a sci-fi feed. Each request
// glows inside its own screen, turned a little to the left or right, and one
// live wire runs down the left edge with a short tap into each screen. Gentle
// bursts of light travel down the wire (Steve, 2026-10-29). Colors come from
// the theme's tokens (backdrop, wire, burst, screen). Reduced motion keeps the
// wire and stops the bursts.
import type { Card, FeedTheme } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';

import { Rod, tubeShades } from '@/components/vine-flow';
import { Tr, useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { feedListTuning } from './list-tuning';
import { glow, isDark, textOn } from './motifs';

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
  // Glass neon tubes (Steve, 2026-10-30): near-white in the middle, deeper color toward
  // the edge of the glass, a radiant glow around it, and smooth curves, no corners.
  const wire = tubeShades(tokens.wire);
  const screen = tubeShades(tokens.screen);
  return (
    <View style={styles.row} testID={`screen-${card.id}`}>
      {/* The wire, the curved tube from it into this screen, and the bursts on it. */}
      <View style={[styles.wire, { backgroundColor: wire.edge, ...glow(tokens.wire, 14) }]}>
        <View style={[styles.wireBody, { backgroundColor: wire.inner }]} />
        <View style={[styles.wireCore, { backgroundColor: wire.core }]} />
        {reduced ? null : <Burst tokens={tokens} delay={(index % 4) * 650} />}
      </View>
      <View style={styles.tap} pointerEvents="none">
        <Svg aria-hidden width={60} height={60} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Rod d="M 11 10 C 11 34, 22 44, 44 44" color={tokens.wire} width={4} />
        </Svg>
      </View>
      <View
        style={[
          styles.screen,
          { borderColor: screen.edge, ...glow(tokens.screen, 20) },
          { transform: [{ perspective: 900 }, { rotateY: `${left ? tokens.tilt : -tokens.tilt}deg` }] },
        ]}>
        <View style={[styles.ring, { borderColor: screen.inner, borderRadius: radius.lg - 3 }]}>
          <View style={[styles.ring, { borderColor: screen.core, borderRadius: radius.lg - 5 }]}>
            <View style={[styles.ring, { borderColor: screen.inner, borderRadius: radius.lg - 7 }]}>
              <View style={[styles.ringEdge, { borderColor: screen.edge }]}>
                {pinned ? <Tr k="feed.pinned" style={[styles.pinned, { color: tokens.wire }]} /> : null}
                <View style={styles.glass}>{children}</View>
              </View>
            </View>
          </View>
        </View>
      </View>
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
              <View style={[styles.endNode, { borderColor: tubeShades(tokens.wire).edge, backgroundColor: tubeShades(tokens.wire).core, ...glow(tokens.wire, 14) }]} />
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
  // The screen's frame is one glass tube: deep color at both edges, near white in the middle.
  ring: { borderWidth: 1.5 },
  ringEdge: { borderWidth: 2, borderRadius: radius.lg - 9, padding: 5, backgroundColor: '#0E1220' },
  headerPanel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm, marginBottom: space.md },
  row: { position: 'relative', paddingVertical: space.md },
  // The live wire runs down the left edge of every row, so together the rows form one line.
  wire: { position: 'absolute', left: 8, top: 0, bottom: 0, width: 6 },
  wireBody: { position: 'absolute', left: 1, top: 0, bottom: 0, width: 4 },
  wireCore: { position: 'absolute', left: 2.25, top: 0, bottom: 0, width: 1.5 },
  burst: { position: 'absolute', left: -1, width: 8, height: 18, borderRadius: 4 },
  tap: { position: 'absolute', top: '50%', left: 0, marginTop: -44 },
  screen: { marginLeft: 44, borderWidth: 2, borderRadius: radius.lg },
  glass: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  pinned: { ...type.small, fontWeight: '700', marginBottom: 4 },
  end: { alignItems: 'center', gap: space.sm, paddingTop: space.md },
  endNode: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
