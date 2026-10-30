/**
 * The post's action icons as neon, for the Neon Circuit skin (Steve, 2026-10-30: "techy neon buttons BELOW the post,
 * a neon representation of standard icons", "MORE TRON LIKE"). Straight segments, each in a rectangle with small rounded
 * corners, drawn three times: a wide faint bloom, a colored tube and a thin white-hot core.
 */
import type { CardAction } from '@prayer-tower/shared';
import Svg, { G, Path } from 'react-native-svg';

const diamond = (x: number, y: number, r = 2.8) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;

// 24-unit icons: thumbs up, two praying hands, a radio tower, heart, share, and an open hand held out to help.
const SHAPES: Partial<Record<CardAction, string[]>> = {
  thumbs_up: ['M2 10h4v11H2z', 'M6 11l4-7.5 1.5-.5 1.5 1.5-.5 5h7l1.5 1.5-.5 2 .5 1.5-1 2 .3 1.5-1.3 2.5-1.5.5H6', 'M20.5 13h-4', 'M20 16.5h-4'],
  praying_now: ['M11.2 3L9 7v6l-4 4v4h4l2.2-3z', 'M12.8 3L15 7v6l4 4v4h-4l-2.2-3z'],
  // A radio tower sending waves (Steve, 2026-10-30).
  commit: ['M12 11.5L8.5 22', 'M12 11.5l3.5 11', 'M10 17h4', 'M9.4 19.6l5.4-3.6', 'M10.6 10.6a1.7 1.7 0 1 1 2.8 0', 'M7.6 7.4a6 6 0 0 1 8.8 0', 'M4.6 4.4a10.4 10.4 0 0 1 14.8 0', 'M1.8 1.6a14.6 14.6 0 0 1 20.4 0'],
  well_wishes: ['M12 21L3 12V7l3.5-3.5H10L12 6l2-2.5h3.5L21 7v5z', 'M12 17.5l-6-6V8l1.5-1.5H9l3 3 3-3h1.5L18 8v3.5z'],
  share: ['M8.4 10.8l7.2-4.2', 'M8.4 13.2l7.2 4.2', diamond(18, 5), diamond(6, 12), diamond(18, 19)],
  gift_tokens: ['M2 12h3v8H2z', 'M5 19h10l7-5-1-1.5-6 3.5', 'M5 14l4-2h6l1 1.5-1 1.5h-5'],
};

// A rectangle with small rounded corners, no decorative corners (Steve's Tron look).
const FRAME = 'M1 -2H23A3 3 0 0 1 26 1V23A3 3 0 0 1 23 26H1A3 3 0 0 1 -2 23V1A3 3 0 0 1 1 -2Z';

export const hasNeonIcon = (action: CardAction) => !!SHAPES[action];

export function NeonActionIcon({ action, color, size = 40 }: { action: CardAction; color: string; size?: number }) {
  const paths = SHAPES[action];
  if (!paths) return null;
  const layer = (stroke: string, width: number, opacity: number, frame: boolean) => (
    <G fill="none" stroke={stroke} strokeWidth={width} strokeOpacity={opacity} strokeLinecap="square" strokeLinejoin="miter">
      {frame ? <Path d={FRAME} strokeWidth={width * 0.6} /> : null}
      {paths.map((d) => (
        <Path key={d} d={d} />
      ))}
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="-4 -4 32 32" aria-hidden>
      {layer(color, 4, 0.22, true)}
      {layer(color, 2.2, 0.6, true)}
      {layer('#FFFFFF', 0.8, 0.95, false)}
    </Svg>
  );
}
