// Decorations the vine skins draw from their tokens (docs/FEED_SKINS.md):
//   * leaf marks: 'flower' (Blossom Garden: five petals round a center) and
//     'star' (Neon Cinderella: a glowing four-point star);
//   * neon scenery for Neon Cinderella: a castle, a pumpkin coach and a glass
//     slipper drawn as glowing outlines between the requests. All three are our
//     own simple line drawings built from shapes, not copies of anyone's art.
// Nothing here needs an image or a native module: plain views with borders and
// shadows, so they work on iPhone, iPad and the web build alike.
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

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

export type SceneKind = 'castle' | 'coach' | 'slipper';
export const SCENES: SceneKind[] = ['castle', 'coach', 'slipper'];

/** One neon outline drawing, centered on the stem. */
export function NeonScene({ kind, line, accent }: { kind: SceneKind; line: string; accent: string }) {
  const stroke = (c: string): ViewStyle => ({ borderColor: c, borderWidth: 2.5, ...glow(c) });
  return (
    <View style={styles.scene} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`scene-${kind}`}>
      {kind === 'castle' ? (
        <View style={styles.castle}>
          {/* Three towers with pointed roofs, a keep and an arched door. */}
          {[
            { left: 0, h: 70 },
            { left: 52, h: 96 },
            { left: 104, h: 70 },
          ].map((tw, i) => (
            <View key={i} style={{ position: 'absolute', left: tw.left, bottom: 0, width: 36, alignItems: 'center' }}>
              <View style={[styles.roof, { borderBottomColor: accent }]} />
              <View style={[{ width: 30, height: tw.h, borderTopLeftRadius: 2, borderTopRightRadius: 2 }, stroke(line)]} />
            </View>
          ))}
          <View style={[styles.keep, stroke(line)]} />
          <View style={[styles.door, stroke(accent)]} />
        </View>
      ) : kind === 'coach' ? (
        <View style={styles.coach}>
          {/* A round pumpkin body with ribs, a little door, a curl on top and two wheels. */}
          <View style={[styles.curl, stroke(line)]} />
          <View style={[styles.pumpkin, stroke(accent)]}>
            <View style={[styles.rib, { borderColor: accent }]} />
            <View style={[styles.coachDoor, stroke(line)]} />
          </View>
          <View style={[styles.wheel, { left: 18 }, stroke(line)]} />
          <View style={[styles.wheel, { right: 18 }, stroke(line)]} />
        </View>
      ) : (
        <View style={styles.slipper}>
          {/* A heeled shoe: a low curved body, a toe and a slim heel, with a sparkle. */}
          <View style={[styles.shoe, stroke(line)]} />
          <View style={[styles.heel, stroke(line)]} />
          <Text style={[styles.sparkle, { color: accent, textShadowColor: accent }]}>✧</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { alignSelf: 'center', height: 130, width: 160, marginVertical: 18, alignItems: 'center', justifyContent: 'flex-end' },
  castle: { width: 140, height: 120 },
  roof: { width: 0, height: 0, borderLeftWidth: 18, borderRightWidth: 18, borderBottomWidth: 24, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  keep: { position: 'absolute', left: 28, right: 28, bottom: 0, height: 46 },
  door: { position: 'absolute', left: 58, bottom: 0, width: 24, height: 30, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomWidth: 0 },
  coach: { width: 150, height: 110 },
  curl: { position: 'absolute', left: 68, top: 0, width: 16, height: 16, borderRadius: 8, borderBottomColor: 'transparent' },
  pumpkin: { position: 'absolute', left: 15, right: 15, top: 12, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  rib: { position: 'absolute', left: 36, right: 36, top: 2, bottom: 2, borderRadius: 30, borderWidth: 1.5 },
  coachDoor: { width: 22, height: 30, borderRadius: 6 },
  wheel: { position: 'absolute', bottom: 0, width: 30, height: 30, borderRadius: 15 },
  slipper: { width: 150, height: 80 },
  shoe: { position: 'absolute', left: 10, right: 30, bottom: 14, height: 34, borderTopLeftRadius: 40, borderBottomLeftRadius: 18, borderTopRightRadius: 8, borderBottomRightRadius: 4 },
  heel: { position: 'absolute', right: 30, bottom: 0, width: 8, height: 30, borderRadius: 2 },
  sparkle: { position: 'absolute', right: 6, top: 0, fontSize: 24, textShadowRadius: 8, textShadowOffset: { width: 0, height: 0 } },
});
