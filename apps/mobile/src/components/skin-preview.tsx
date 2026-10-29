// A small drawing of a feed skin: its backdrop, stem and leaf (vine), stone pillars and
// climber (tower), glowing screen on a wire (circuit), or one full card (wall). Used by
// the theme maker and the skin gallery. Colors that aren't #RRGGBB yet (half typed in
// the maker) fall back to the layout's own.
import type { FeedTheme } from '@prayer-tower/shared';
import { StyleSheet, Text, View } from 'react-native';

import { circuitTokens } from '@/layouts/circuit';
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
  if (layout === 'wall') return frame(wallBackdrop(theme), <View style={[styles.cardBox, { alignSelf: 'center', width: '80%' }]}>{card}</View>);
  if (layout !== 'vine') return frame(colors.background, <View style={[styles.cardBox, { alignSelf: 'center', width: '80%' }]}>{card}</View>);
  const v = vineTokens(theme);
  const w = v.stemWidth;
  return frame(
    v.backdrop || colors.background,
    <>
      {v.stemDouble ? (
        <View style={[styles.stem, { width: w * 3, marginLeft: -(w * 3) / 2, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderColor: v.stem }]} />
      ) : (
        <View style={[styles.stem, { width: w, marginLeft: -w / 2, backgroundColor: v.stem }, v.stemGlow && glow(v.stem, 10)]} />
      )}
      <View style={styles.leaf}>
        {v.leafShape === 'flower' || v.leafShape === 'star' ? (
          <LeafMark shape={v.leafShape} leaf={v.leaf} accent={v.tendril} size={26} />
        ) : (
          <View style={[styles.leafPlain, v.leafShape === 'pointed' && styles.leafPointed, v.leafShape === 'tablet' && styles.leafTablet, { backgroundColor: v.leaf }]} />
        )}
      </View>
      <View style={[styles.cardBox, { alignSelf: 'flex-end' }]}>{card}</View>
      <View style={[styles.comment, { backgroundColor: v.leafSoft, borderColor: v.leaf }]} />
    </>,
  );
}

const styles = StyleSheet.create({
  preview: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', justifyContent: 'center', padding: space.md },
  stem: { position: 'absolute', left: '50%', top: 0, bottom: 0 },
  leaf: { position: 'absolute', left: '50%', top: 26, marginLeft: 6 },
  leafPlain: { width: 34, height: 18, borderTopLeftRadius: 18, borderBottomRightRadius: 18 },
  leafPointed: { borderTopLeftRadius: 2, borderBottomRightRadius: 2, borderTopRightRadius: 18, borderBottomLeftRadius: 18 },
  leafTablet: { width: 16, height: 22, borderRadius: 2, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  cardBox: { width: '42%' },
  card: { height: 64, borderRadius: radius.md, backgroundColor: colors.surface },
  comment: { position: 'absolute', left: space.md, bottom: space.md, width: '38%', height: 26, borderRadius: radius.md, borderWidth: 1 },
  pillar: { position: 'absolute', top: 0, bottom: 0, width: 16, borderWidth: 1 },
  climber: { position: 'absolute', right: 0, top: '40%', fontSize: 24 },
  wire: { position: 'absolute', left: 14, top: 0, bottom: 0, width: 2 },
  screen: { marginLeft: 40, width: '60%', borderWidth: 2, borderRadius: radius.md, padding: 4, backgroundColor: '#0E1220' },
});
