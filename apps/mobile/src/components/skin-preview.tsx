// A small drawing of a feed skin: its backdrop and the drawn vine with a request and a comment in their leaves (vine), stone pillars and
// climber (tower), glowing screen on a wire (circuit), a plaque in a shadow box with an angel statuette (ceramic), or one full card (wall). Used by
// the theme maker and the skin gallery. Colors that aren't #RRGGBB yet (half typed in
// the maker) fall back to the layout's own.
import type { FeedTheme } from '@prayer-tower/shared';
import { StyleSheet, Text, View } from 'react-native';

import { ceramicTokens, Figurine } from '@/layouts/ceramic';
import { circuitTokens } from '@/layouts/circuit';
import { climbTokens, EDGE_X } from '@/layouts/climb';
import { sparklerTokens } from '@/layouts/sparkler';
import { LeafFrame, VineRow } from '@/components/vine-flow';
import { glow, LeafMark } from '@/layouts/motifs';
import { towerTokens } from '@/layouts/tower';
import { vineTokens } from '@/layouts/vine';
import { wallBackdrop } from '@/layouts/wall';
import { colors, radius, space } from '@/lib/theme';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function SkinPreview({ layout, tokens, height = 170, testID }: { layout: string; tokens: Record<string, unknown>; height?: number; testID?: string }) {
  // Drop colors that aren't finished yet, so the layout's defaults show instead.
  const clean = Object.fromEntries(Object.entries(tokens).filter(([, v]) => typeof v !== 'string' || !v.startsWith('#') || HEX.test(v)));
  const theme = { slug: 'preview', name: 'preview', layout, cardTemplates: {}, animations: {}, tokens: clean } as FeedTheme;
  const card = <View style={styles.card} />;
  const frame = (backdrop: string, children: React.ReactNode) => (
    <View style={[styles.preview, { height, backgroundColor: backdrop }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      {children}
    </View>
  );
  if (layout === 'tower') {
    const t = towerTokens(theme);
    return frame(
      t.backdrop,
      <>
        <View style={[styles.pillar, { left: 0, backgroundColor: t.stone, borderColor: t.mortar }]} />
        <View style={[styles.pillar, { right: 0, backgroundColor: t.stone, borderColor: t.mortar }]} />
        <Text style={styles.climber}>🧗</Text>
        <View style={[styles.cardBox, { alignSelf: 'center' }]}>{card}</View>
      </>,
    );
  }
  if (layout === 'circuit') {
    const t = circuitTokens(theme);
    return frame(
      t.backdrop,
      <>
        <View style={[styles.wire, { backgroundColor: t.wire }, glow(t.wire, 6)]} />
        <View style={[styles.screen, { borderColor: t.screen }, glow(t.screen, 10), { transform: [{ perspective: 600 }, { rotateY: `${t.tilt}deg` }] }]}>{card}</View>
      </>,
    );
  }
  if (layout === 'climb') {
    const t = climbTokens(theme);
    // The rock face, the sky past its edge, and the rope down the edge.
    return frame(
      t.backdrop,
      <>
        <View style={[styles.sky, { width: EDGE_X / 2 }]} />
        <View style={[styles.rope, { left: EDGE_X / 2 - 6 }]} />
        <View style={[styles.cardBox, { alignSelf: 'center', width: '70%' }]}>
          <View style={[styles.card, { backgroundColor: t.slab }]} />
        </View>
      </>,
    );
  }
  if (layout === 'sparkler') {
    const t = sparklerTokens(theme);
    // Full-width white posts split by the black line with its light blue middle, and the line down the left with its spark.
    const square = <View style={[styles.square]} />;
    const split = (
      <View style={[styles.split, { backgroundColor: t.backdrop }]}>
        <View style={{ height: 2, backgroundColor: t.stripe }} />
      </View>
    );
    return frame(
      t.backdrop,
      <>
        {square}
        {split}
        {square}
        <View style={[styles.sparkLine, { backgroundColor: t.stripe }]} />
        <View style={styles.spark} />
      </>,
    );
  }
  if (layout === 'ceramic') {
    // A plaque in its shadow box on a platform, with an angel statuette beside it.
    const t = ceramicTokens(theme);
    return frame(
      t.backdrop,
      <>
        <View style={styles.statue}>
          <Figurine look="angel" pose="present" width={36} height={60} />
        </View>
        <View style={[styles.cardBox, { alignSelf: 'center', width: '66%', padding: 6, borderRadius: 12, backgroundColor: t.frame, borderWidth: 2, borderColor: t.recess }]}>{card}</View>
        <View style={{ alignSelf: 'center', width: '72%', height: 8, borderRadius: 4, backgroundColor: t.platform }} />
      </>,
    );
  }
  if (layout === 'wall') return frame(wallBackdrop(theme), <View style={[styles.cardBox, { alignSelf: 'center', width: '80%' }]}>{card}</View>);
  if (layout !== 'vine') return frame(colors.background, <View style={[styles.cardBox, { alignSelf: 'center', width: '80%' }]}>{card}</View>);
  const v = vineTokens(theme);
  const mark = (size: number) => (v.vineStyle !== 'floral' && (v.leafShape === 'flower' || v.leafShape === 'star') ? <LeafMark shape={v.leafShape} leaf={v.leaf} accent={v.tendril} size={size} /> : undefined);
  // The drawn vine in miniature: a request in its leaf, then a comment leaf below it on the other side.
  return (
    <View style={[styles.preview, styles.vinePreview, { height, backgroundColor: v.backdrop || colors.background }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <VineRow from={null} side="left" look={v} gap={10}>
        <LeafFrame side="left" look={v} bare mark={mark(20)}>
          <View style={styles.miniCard} />
        </LeafFrame>
      </VineRow>
      <VineRow from="left" side="right" look={v} gap={22} depth={1}>
        <LeafFrame side="right" look={v} depth={1} mark={mark(14)}>
          <View style={styles.miniLine} />
        </LeafFrame>
      </VineRow>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', justifyContent: 'center', padding: space.md },
  cardBox: { width: '42%' },
  statue: { position: 'absolute', left: 6, bottom: 10 },
  vinePreview: { justifyContent: 'flex-start', paddingTop: 0 },
  miniCard: { height: 46, borderRadius: radius.md, backgroundColor: colors.surface },
  miniLine: { height: 14 },
  card: { height: 64, borderRadius: radius.md, backgroundColor: colors.surface },
  pillar: { position: 'absolute', top: 0, bottom: 0, width: 16, borderWidth: 1 },
  climber: { position: 'absolute', right: 0, top: '40%', fontSize: 24 },
  wire: { position: 'absolute', left: 14, top: 0, bottom: 0, width: 2 },
  sky: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#D9E3E8', borderRightWidth: 2, borderRightColor: '#4F4436' },
  rope: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#C4441F' },
  square: { height: 60, backgroundColor: '#FFFFFF', marginHorizontal: -space.md },
  split: { height: 8, justifyContent: 'center', marginHorizontal: -space.md },
  sparkLine: { position: 'absolute', left: 10, top: 0, height: '62%', width: 3 },
  spark: { position: 'absolute', left: 5, top: '58%', width: 13, height: 13, borderRadius: 7, backgroundColor: '#FFE680', borderWidth: 2, borderColor: '#FFFFFF' },
  screen: { marginLeft: 40, width: '60%', borderWidth: 2, borderRadius: radius.md, padding: 4, backgroundColor: '#0E1220' },
});
