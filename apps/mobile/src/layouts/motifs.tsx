// Decorations the vine skins draw from their tokens (docs/FEED_SKINS.md):
//   * leaf marks: 'flower' (Blossom Garden: five petals round a center) and
//     'star' (Neon Cinderella: a glowing four-point star);
//   * neon scenery for Neon Cinderella: a castle, a pumpkin coach, a clock at
//     midnight and a glass slipper, bent from glowing neon tubes between the
//     requests. All are our own line drawings, not copies of anyone's art.
// Drawn with react-native-svg, so they work on iPhone, iPad and the web build alike.
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Rod } from '@/components/vine-flow';

/** A neon glow around a shape (iOS and web draw the shadow; Android shows the line only). */
export const glow = (color: string, radius = 8): ViewStyle => ({ shadowColor: color, shadowOpacity: 0.9, shadowRadius: radius, shadowOffset: { width: 0, height: 0 } });

/** Light or dark text for something drawn straight on the backdrop. */
export function textOn(backdrop: string): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(backdrop)) return '#2B2530';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(backdrop.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.5 ? '#2B2530' : '#F1ECFF';
}
export const isDark = (backdrop: string) => textOn(backdrop) !== '#2B2530';

/** Five petals round a center: a blossom. `size` is the whole flower's width. */
export function Blossom({ color, center, size = 22 }: { color: string; center: string; size?: number }) {
  const p = size * 0.42;
  const r = (size - p) / 2;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 72, 144, 216, 288].map((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        return (
          <View
            key={deg}
            style={{ position: 'absolute', width: p, height: p, borderRadius: p / 2, backgroundColor: color, left: size / 2 - p / 2 + r * Math.cos(rad), top: size / 2 - p / 2 + r * Math.sin(rad) }}
          />
        );
      })}
      <View style={{ position: 'absolute', width: p * 0.8, height: p * 0.8, borderRadius: p, backgroundColor: center, left: size / 2 - p * 0.4, top: size / 2 - p * 0.4 }} />
    </View>
  );
}

/** A glowing four-point star. */
export function NeonStar({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Text
      style={{ fontSize: size, lineHeight: size * 1.1, color, textShadowColor: color, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      ✦
    </Text>
  );
}

/** The leaf mark for a shape the plain leaf view can't draw; null for the others. */
export function LeafMark({ shape, leaf, accent, size }: { shape: string; leaf: string; accent: string; size?: number }) {
  if (shape === 'flower') return <Blossom color={leaf} center={accent} size={size} />;
  if (shape === 'star') return <NeonStar color={leaf} size={size} />;
  return null;
}

export type SceneKind = 'castle' | 'coach' | 'slipper' | 'clock';
export const SCENES: SceneKind[] = ['castle', 'coach', 'clock', 'slipper'];

/** Points round a circle, for wheel spokes and clock ticks. */
function around(cx: number, cy: number, r1: number, r2: number, n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + offset;
    return `M ${(cx + r1 * Math.cos(a)).toFixed(1)} ${(cy + r1 * Math.sin(a)).toFixed(1)} L ${(cx + r2 * Math.cos(a)).toFixed(1)} ${(cy + r2 * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}

/**
 * One neon drawing, centered on the stem: each line is a glowing tube (a wide
 * faint bloom, a halo and a white-hot core), the way real neon signs are bent.
 */
export function NeonScene({ kind, line, accent }: { kind: SceneKind; line: string; accent: string }) {
  let n = 0;
  const tube = (d: string, c = line, w = 2.2) => <Rod key={n++} d={d} color={c} width={w} />;
  let art: React.ReactNode;
  if (kind === 'castle') {
    // A keep with battlements, three towers with tall spires and pennants, an arched gate and lit windows.
    art = (
      <>
        {tube('M 30 150 L 30 92 L 38 92 L 38 86 L 46 86 L 46 92 L 54 92 L 54 86 L 62 86 L 62 92 L 70 92 L 70 86 L 78 86 L 78 92 L 86 92 L 86 86 L 94 86 L 94 92 L 102 92 L 102 86 L 110 86 L 110 92 L 118 92 L 118 86 L 126 86 L 126 92 L 130 92 L 130 150')}
        {tube('M 14 150 L 14 70 L 34 70 L 34 150 M 126 150 L 126 70 L 146 70 L 146 150')}
        {tube('M 62 92 L 62 44 L 98 44 L 98 92')}
        {tube('M 10 70 L 24 30 L 38 70 M 122 70 L 136 30 L 150 70 M 58 44 L 80 2 L 102 44', accent)}
        {tube('M 80 2 L 80 -10 L 94 -6 L 80 -2 M 24 30 L 24 22 L 34 25 L 24 28 M 136 30 L 136 22 L 146 25 L 136 28', accent, 1.6)}
        {tube('M 68 150 L 68 126 Q 80 110 92 126 L 92 150', accent)}
        {tube('M 74 58 L 74 72 M 86 58 L 86 72 M 21 92 L 21 102 M 139 92 L 139 102 M 48 110 L 48 120 M 112 110 L 112 120', line, 1.6)}
        {tube('M 0 150 L 160 150', line, 1.6)}
      </>
    );
  } else if (kind === 'coach') {
    // A pumpkin body with ribs, a door and window, a curling stem, scrollwork and two spoked wheels.
    art = (
      <>
        {tube('M 30 98 C 18 60, 44 34, 80 36 C 116 34, 142 60, 130 98 C 118 116, 42 116, 30 98 Z', accent, 2.4)}
        {tube('M 56 40 C 44 60, 44 90, 58 110 M 104 40 C 116 60, 116 90, 102 110 M 80 36 L 80 112', accent, 1.4)}
        {tube('M 66 98 L 66 64 Q 80 52 94 64 L 94 98 Z M 72 74 Q 80 66 88 74 L 88 84 L 72 84 Z', line, 1.6)}
        {tube('M 80 36 C 78 24, 86 18, 92 22 C 98 26, 92 32, 88 28', line, 1.8)}
        {tube('M 22 104 C 10 104, 8 118, 18 120 C 26 122, 28 112, 22 112 M 138 104 C 150 104, 152 118, 142 120 C 134 122, 132 112, 138 112', line, 1.4)}
        <Circle cx={40} cy={128} r={18} fill="none" stroke={line} strokeOpacity={0.25} strokeWidth={10} />
        {tube('M 58 128 A 18 18 0 1 1 22 128 A 18 18 0 1 1 58 128 Z M 138 128 A 18 18 0 1 1 102 128 A 18 18 0 1 1 138 128 Z', line, 2)}
        {tube(`${around(40, 128, 3, 16, 8)} ${around(120, 128, 3, 16, 8)}`, line, 1)}
      </>
    );
  } else if (kind === 'clock') {
    // A clock face at midnight: twelve ticks, both hands straight up, a bell on top.
    art = (
      <>
        {tube('M 130 78 A 50 50 0 1 1 30 78 A 50 50 0 1 1 130 78 Z', line, 2.4)}
        {tube('M 122 78 A 42 42 0 1 1 38 78 A 42 42 0 1 1 122 78 Z', line, 1)}
        {tube(around(80, 78, 34, 41, 12, -Math.PI / 2), accent, 1.6)}
        {tube('M 80 78 L 80 44 M 80 78 L 80 52 M 76 74 L 84 82', accent, 2.4)}
        {tube('M 64 30 Q 80 8 96 30 M 80 12 L 80 6', line, 1.8)}
        {tube('M 58 132 L 50 146 M 102 132 L 110 146', line, 1.8)}
      </>
    );
  } else {
    // A glass slipper: a pointed toe, a sweeping vamp, a slim high heel, and sparkles.
    art = (
      <>
        {tube('M 16 118 C 30 104, 54 98, 74 102 C 92 106, 100 92, 112 72 C 120 60, 136 60, 140 74 L 142 118 C 120 118, 112 114, 104 118 Z', line, 2.4)}
        {tube('M 126 118 L 132 148 L 138 148 L 142 118', line, 2)}
        {tube('M 40 112 C 60 104, 84 108, 104 100', line, 1)}
        {tube(`${sparklePath(48, 70, 8)} ${sparklePath(28, 88, 5)} ${sparklePath(150, 50, 6)}`, accent, 1.2)}
      </>
    );
  }
  return (
    <View style={styles.scene} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`scene-${kind}`}>
      <Svg aria-hidden width={180} height={170} viewBox="-10 -14 180 170" pointerEvents="none">
        {art}
      </Svg>
    </View>
  );
}

function sparklePath(x: number, y: number, r: number) {
  const k = r * 0.25;
  return `M ${x} ${y - r} L ${x + k} ${y - k} L ${x + r} ${y} L ${x + k} ${y + k} L ${x} ${y + r} L ${x - k} ${y + k} L ${x - r} ${y} L ${x - k} ${y - k} Z`;
}

const styles = StyleSheet.create({
  scene: { alignSelf: 'center', height: 170, width: 180, marginVertical: 18, alignItems: 'center', justifyContent: 'center' },
});
