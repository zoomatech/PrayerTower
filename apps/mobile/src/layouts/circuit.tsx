// Neon Circuit (beta, behind Admin → Feed skins): a sci-fi feed. Each request
// glows inside its own screen, turned a little to the left or right, and one
// live wire runs down the left edge with a short tap into each screen. Gentle
// bursts of light travel down the wire (Steve, 2026-10-29). Colors come from
// the theme's tokens (backdrop, wire, burst, screen). Reduced motion keeps the
// wire and stops the bursts.
import type { Card, FeedTheme } from '@prayer-tower/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { CardFrame } from '@/components/post-card';
import { GlassTube, GLOW_REACH, roundedBox, tubeShades } from '@/components/glass-tube';
import { boxRuns, Sparkles } from '@/components/sparkles';
import { DrawBusContext, makeDrawBus, useDrawIn, type Row } from '@/lib/draw-in';
import { Tr, useLocale } from '@/lib/i18n';
import { useReducedMotion } from '@/lib/motion';
import { colors, radius, space, type } from '@/lib/theme';

import type { FeedLayoutProps } from './index';
import { CommentStack } from './circuit-comments';
import { feedListTuning } from './list-tuning';
import { glow, isDark, textOn } from './motifs';

// Tron colors (Steve, 2026-10-30): strong electric blue and red on near-black. Posts and the
// wire are blue; comments are red (circuit-comments.tsx), as on the iPhone.
const DEFAULTS = { backdrop: '#02040A', wire: '#1E9BFF', burst: '#FFFFFF', screen: '#FF2A1F', tilt: 10 };
/** Where the wire runs, and where its tap meets the screen. */
const WIRE_X = 12;
const TAP_END = 44;
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
  // Every line is a neon glass tube (components/glass-tube.tsx). The wire builds down into this
  // row as it comes into view, then the tap reaches out and the screen's tube frame lights.
  const rowRef = useRef<Row>(null);
  const { drawn, onLayout: drawOnLayout } = useDrawIn(rowRef, 1600);
  const [row, setRow] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ y: 0, w: 0, h: 0 });
  const room = GLOW_REACH + 4;
  const screen = (postBox: React.ReactNode) => (
        <Animated.View
          style={[
            styles.screen,
            { transform: [{ perspective: 900 }, { rotateY: `${left ? tokens.tilt : -tokens.tilt}deg` }] },
          ]}
          onLayout={(e) => {
            const { y, width, height } = e.nativeEvent.layout;
            if (Math.abs(width - box.w) > 1 || Math.abs(height - box.h) > 1 || Math.abs(y - box.y) > 1) setBox({ y, w: width, h: height });
          }}>
          {/* The screen's frame: one glass tube bent into a rectangle with elegantly rounded corners.
              Scrolling down, its top is drawn first and its bottom, still mostly off screen, last. */}
          {box.w ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.frameClip, { left: -room, top: -room, width: box.w + room * 2, height: drawn.interpolate({ inputRange: [0, 0.4, 0.8, 1], outputRange: [0, 0, box.h + room * 2, box.h + room * 2] }) }]}>
              <Svg aria-hidden width={box.w + room * 2} height={box.h + room * 2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <GlassTube d={roundedBox(box.w + room * 2, box.h + room * 2, 16, room + 3)} color={tokens.wire} width={6} />
              </Svg>
            </Animated.View>
          ) : null}
          {/* Now and then a sparkle of light runs round the screen's tube. */}
          {box.w ? <Sparkles runs={boxRuns(box.w, box.h, 3)} color={tokens.wire} /> : null}
          {/* The card's words fade in only once the tube round it is drawn. */}
          <Animated.View style={{ opacity: drawn.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 0, 1] }) }}>
            {pinned ? <Tr k="feed.pinned" style={[styles.pinned, { color: tokens.wire }]} /> : null}
            <View style={styles.glass}>{postBox}</View>
          </Animated.View>
        </Animated.View>
  );
  return (
    <View
      ref={rowRef}
      style={styles.row}
      testID={`screen-${card.id}`}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - row.w) > 1 || Math.abs(height - row.h) > 1) setRow({ w: width, h: height });
        drawOnLayout();
      }}>
      {/* The wire down this row, and its tap into the screen. */}
      {row.h ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wireClip, { width: WIRE_X + room + TAP_END, height: drawn.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, row.h, row.h] }) }]}>
          <Svg aria-hidden width={WIRE_X + room + TAP_END} height={row.h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <GlassTube d={`M ${WIRE_X} 0 L ${WIRE_X} ${row.h}`} color={tokens.wire} width={5} />
            {/* Circuit traces off the wire: short runs with 45° bends, each ending in a via. */}
            {[0.18, 0.78].map((t, i) => {
              const y = row.h * t;
              const end = { x: WIRE_X + 22, y: y + (i ? -10 : 10) };
              return (
                <G key={t}>
                  <GlassTube d={`M ${WIRE_X} ${y} L ${WIRE_X + 12} ${y} L ${end.x} ${end.y}`} color={tokens.wire} width={2.2} />
                  <Circle cx={end.x} cy={end.y} r={3} fill={tokens.backdrop} stroke={tubeShades(tokens.wire).inner} strokeWidth={1.6} />
                </G>
              );
            })}
          </Svg>
        </Animated.View>
      ) : null}
      {row.h ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.tapClip, { top: box.y + box.h / 2 - room, width: drawn.interpolate({ inputRange: [0, 0.3, 0.45, 1], outputRange: [0, 0, TAP_END + 22 + room, TAP_END + 22 + room] }) }]}>
          <Svg aria-hidden width={TAP_END + 22 + room} height={room * 2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {/* The connector takes its box's color. */}
            <GlassTube d={`M ${WIRE_X} ${room} L ${TAP_END + 22} ${room}`} color={tokens.wire} width={4} />
          </Svg>
        </Animated.View>
      ) : null}
      {/* And along the wire and the tap. */}
      {row.h ? <Sparkles runs={[{ x1: WIRE_X, y1: 0, x2: WIRE_X, y2: row.h }, { x1: WIRE_X, y1: box.y + box.h / 2, x2: TAP_END + 6, y2: box.y + box.h / 2 }]} color={tokens.wire} /> : null}
      {reduced || !row.h ? null : (
        // Current runs only once the wire is drawn.
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: drawn.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] }) }]} pointerEvents="none">
          <Burst tokens={tokens} delay={(index % 4) * 650} />
        </Animated.View>
      )}
      {/* The post glows inside the screen; its action icons sit under it on the black, as neon (Steve, 2026-10-30). */}
      <CardFrame.Provider value={{ frame: screen, neon: { color: tokens.wire, active: tokens.screen }, inset: TAP_END + 6 }}>{children}</CardFrame.Provider>
      {/* Its comments branch from it, a loaded stack to flip through. */}
      <CommentStack card={card} tokens={tokens} start={TAP_END + 6} />
    </View>
  );
}

export function CircuitLayout({ cards, theme, pinnedId, renderCard, header, refreshing, onRefresh, onEndReached, atEnd }: FeedLayoutProps) {
  const { t } = useLocale();
  const tokens = useMemo(() => circuitTokens(theme), [theme]);
  const reduced = useReducedMotion();
  const drawBus = useMemo(() => makeDrawBus(), []);
  return (
    <DrawBusContext.Provider value={drawBus}>
    <View style={[styles.fill, { backgroundColor: tokens.backdrop }]} testID="circuit-layout">
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <ScreenRow card={item} index={index} tokens={tokens} pinned={item.id === pinnedId} reduced={reduced}>
            {/* Its comments show in the stack below, so the card doesn't repeat one. */}
            {renderCard(item.counts.comments > 0 ? { ...item, topComment: null } : item)}
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
        onScroll={drawBus.emit}
        scrollEventThrottle={50}
        // Rows already on screen when the feed opens or grows draw in too.
        onLayout={drawBus.emit}
        onContentSizeChange={drawBus.emit}
      />
    </View>
    </DrawBusContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.md, paddingBottom: 120 },
  headerPanel: { borderRadius: radius.lg, backgroundColor: colors.background, padding: space.sm, marginBottom: space.md },
  row: { position: 'relative', paddingVertical: space.md },
  // The live wire runs down the left edge of every row, so together the rows form one line.
  frameClip: { position: 'absolute', overflow: 'hidden' },
  wireClip: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  tapClip: { position: 'absolute', left: 0, overflow: 'hidden' },
  burst: { position: 'absolute', left: WIRE_X - 4, width: 8, height: 18, borderRadius: 4 },
  screen: { marginLeft: TAP_END + 6, borderRadius: radius.lg, padding: 8 },
  glass: { borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface },
  pinned: { ...type.small, fontWeight: '700', marginBottom: 4 },
  end: { alignItems: 'center', gap: space.sm, paddingTop: space.md },
  endNode: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
