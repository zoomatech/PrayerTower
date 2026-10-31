/**
 * The Prayers tab's dove (Steve, 2026-10-30: "make it look like a dove"). The 🕊️ emoji draws as a small grey
 * bird or a black outline depending on the font, so the dove is drawn here: white, with an olive sprig.
 */
import Svg, { Circle, Ellipse, G, Path } from "react-native-svg";

const INK = "#3B4A6B";

export function DoveIcon({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <G
        fill="#FFFFFF"
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <Path d="M30 30 C 30 18, 36 8, 50 4 C 46 12, 46 20, 40 28 Z" />
        <Path d="M8 26 C 11 22, 16 22, 19 25 C 24 30, 34 32, 44 34 L 60 30 L 54 38 L 60 42 L 46 42 C 38 48, 24 48, 18 40 C 15 36, 15 32, 14 30 L 6 30 Z" />
        <Path d="M22 34 C 20 22, 24 10, 34 6 C 34 14, 38 22, 44 30 C 38 36, 28 38, 22 34 Z" />
      </G>
      <Circle cx={13} cy={26} r={1.8} fill={INK} />
      <Path
        d="M6 30 L 2 32"
        stroke="#E8A33D"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Path
        d="M5 31 C 6 36, 9 39, 12 41"
        fill="none"
        stroke="#5A8A3A"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Ellipse
        cx={8}
        cy={38}
        rx={3}
        ry={1.5}
        rotation={40}
        origin="8, 38"
        fill="#7CB342"
      />
      <Ellipse
        cx={11}
        cy={36}
        rx={3}
        ry={1.5}
        rotation={-20}
        origin="11, 36"
        fill="#7CB342"
      />
    </Svg>
  );
}
