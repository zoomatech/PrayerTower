/**
 * The post's action icons as neon tubes, for the Neon Circuit skin (Steve, 2026-10-30: "techy neon buttons BELOW the post,
 * a neon representation of standard icons"). Each line is drawn twice: a wide faint bloom under a thin bright core.
 */
import type { CardAction } from '@prayer-tower/shared';
import Svg, { Circle, G, Path } from 'react-native-svg';

// 24-unit outline icons in the common style: thumbs up, praying hands, a mountain with a cross, heart, share, gift.
const SHAPES: Partial<Record<CardAction, { paths: string[]; circles?: [number, number, number][] }>> = {
  thumbs_up: { paths: ['M7 10v11H3V10z', 'M7 10l4-7c1.4 0 2.5 1.1 2.5 2.5L13 9h5.6a2 2 0 0 1 2 2.4l-1.5 7.5A2.5 2.5 0 0 1 16.6 21H7'] },
  praying_now: { paths: ['M12 3c-1.2 1.2-2 3.4-2 6v5l-4 4v3h4l2-3 2 3h4v-3l-4-4V9c0-2.6-.8-4.8-2-6z', 'M12 3v15'] },
  commit: { paths: ['M2 21l7-10 4 5 3-4 6 9z', 'M16 2v6', 'M14 4h4'] },
  well_wishes: { paths: ['M12 20s-7.5-4.6-9.2-9.4A4.6 4.6 0 0 1 12 7.4a4.6 4.6 0 0 1 9.2 3.2C19.5 15.4 12 20 12 20z'] },
  share: { paths: ['M8.2 10.9l7.6-4.4', 'M8.2 13.1l7.6 4.4'], circles: [[18, 5, 2.6], [6, 12, 2.6], [18, 19, 2.6]] },
  gift_tokens: { paths: ['M4 11h16v10H4z', 'M3 7h18v4H3z', 'M12 7v14', 'M12 7C10 3 6.5 4 7.5 7', 'M12 7c2-4 5.5-3 4.5 0'] },
};

export const hasNeonIcon = (action: CardAction) => !!SHAPES[action];

export function NeonActionIcon({ action, color, size = 34 }: { action: CardAction; color: string; size?: number }) {
  const shape = SHAPES[action];
  if (!shape) return null;
  const layer = (stroke: string, width: number, opacity: number) => (
    <G fill="none" stroke={stroke} strokeWidth={width} strokeOpacity={opacity} strokeLinecap="round" strokeLinejoin="round">
      {shape.paths.map((d) => (
        <Path key={d} d={d} />
      ))}
      {shape.circles?.map(([cx, cy, r]) => <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="-2 -2 28 28" aria-hidden>
      {layer(color, 4.5, 0.25)}
      {layer(color, 2.6, 0.45)}
      {layer('#FFFFFF', 1, 0.95)}
    </Svg>
  );
}
