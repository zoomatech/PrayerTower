// The Ceramic Figurine skin's statuettes (Steve, 2026-10-31), drawn from the Claude Design
// component "Figurine": small unglazed pastel figures with angel wings on a round plinth, in
// five looks (Little Angels, Garden Children, Shepherd & Lamb, Choir Kids, Dove Keepers) and
// four poses (sit, stand pointing, host presenting, pull hauling a rope). Original childlike
// figures only. Drawn on a 60 x 100 grid and always scaled evenly, never squished.
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export type FigurineLook = 'angel' | 'garden' | 'shepherd' | 'choir' | 'dove';
export type FigurinePose = 'sit' | 'stand' | 'host' | 'pull';
export const FIGURINE_LOOKS: FigurineLook[] = ['angel', 'garden', 'shepherd', 'choir', 'dove'];

const DRESS: Record<FigurineLook, [string, string]> = {
  angel: ['#D3DFEC', '#95ABC4'],
  garden: ['#D3E6D6', '#93B39A'],
  shepherd: ['#E6D6B9', '#B9A37A'],
  choir: ['#DCCFEA', '#A794C2'],
  dove: ['#F1D7D3', '#C99F98'],
};

const SKIN = '#F7E6D8';
const SKIN_LINE = '#B8957F';

function Dove({ x, y }: { x: number; y: number }) {
  return (
    <G transform={`translate(${x} ${y})`} fill="#FFFFFF" stroke="#9E8E97" strokeWidth={0.8} strokeLinejoin="round">
      <Path d="M-6 1 L-10 -1 L-9 3Z" />
      <Ellipse cx={0} cy={1} rx={6} ry={3.4} />
      <Circle cx={5} cy={-2.2} r={2.4} />
      <Path d="M-3 0 Q0 -5 4 -1" fill="none" />
      <Path d="M7.2 -2.4 L9 -1.8 L7.2 -1.2Z" fill="#E7C78F" stroke="none" />
      <Circle cx={5.6} cy={-2.6} r={0.5} fill="#45363B" stroke="none" />
    </G>
  );
}

function Flower({ x, y }: { x: number; y: number }) {
  const petals: [number, number][] = [
    [-1.9, -0.6],
    [1.9, -0.4],
    [-0.1, -2.6],
    [-1.1, 1.8],
    [1.3, 1.8],
  ];
  return (
    <G>
      {petals.map(([dx, dy], i) => (
        <Circle key={i} cx={x + dx} cy={y + dy} r={2} fill="#F2C4CF" />
      ))}
      <Circle cx={x} cy={y} r={1.3} fill="#EFD79A" />
    </G>
  );
}

/**
 * One statuette. `present`: the host turns a little and lifts its hand to present the post
 * beside it, like a game-show host showing a prize. `flip` faces it the other way.
 */
export function Figurine({ look, pose, present = false, flip = false, width }: { look: FigurineLook; pose: FigurinePose; present?: boolean; flip?: boolean; width: number }) {
  const [dress, dressLine] = DRESS[look];
  const stand = pose !== 'sit';
  const pull = pose === 'pull';
  const host = pose === 'host' || pull;
  // A puller's hands are on the rope until its post is centered; then it lets go to present it.
  const free = !(pull && !present);
  const head = stand ? '' : 'translate(0 12)';
  // Turned a few degrees, never narrowed: the figure keeps its true proportions.
  const turn = host && present ? 'rotate(3 30 94)' : pull ? 'rotate(-6 30 94)' : '';
  return (
    <Svg width={width} height={(width * 100) / 60} viewBox="0 0 60 100" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G transform={flip ? 'translate(60 0) scale(-1 1)' : ''}>
        <Rect x={8} y={94} width={44} height={4.5} rx={1.5} fill="#DCCFC4" stroke="#A89788" strokeWidth={0.7} />
        <Ellipse cx={30} cy={94} rx={22} ry={3.6} fill="#EFE6DE" stroke="#A89788" strokeWidth={0.7} />
        <G transform={turn}>
          {/* Every figure has angel wings (Steve, 2026-10-31). */}
          <G transform={head}>
            <Path d="M23 59C9 50 4 66 12 76c4-4 9-8 13-10Z" fill="#FBF8F3" stroke="#A8968A" strokeWidth={0.9} />
            <Path d="M37 59c14-9 19 7 11 17-4-4-9-8-13-10Z" fill="#FBF8F3" stroke="#A8968A" strokeWidth={0.9} />
            <Path d="M12 66c3 1 6 1 10-1M14 71c2 0 5-1 8-3M48 66c-3 1-6 1-10-1M46 71c-2 0-5-1-8-3" fill="none" stroke="#C4B5AA" strokeWidth={0.8} />
          </G>
          {stand ? (
            <G>
              {free && look === 'shepherd' ? <Path d="M19 98V66c0-6 3-8 6-8 3 0 4 2 4 4.5" fill="none" stroke="#C4A88A" strokeWidth={2.2} strokeLinecap="round" /> : null}
              <Ellipse cx={25} cy={92} rx={5} ry={2.8} fill="#B9A0B2" />
              <Ellipse cx={35} cy={92} rx={5} ry={2.8} fill="#B9A0B2" />
              <Path d="M22 54Q30 50 38 54L44 89Q30 93 16 89Z" fill={dress} stroke={dressLine} strokeWidth={0.9} />
              <Path d="M21 78Q30 81 39 78" fill="none" stroke={dressLine} strokeWidth={0.8} />
              {free ? (
                <G>
                  <Path d="M23.5 58Q17.5 67 19 76" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={19} cy={77.5} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                </G>
              ) : null}
              {pose === 'stand' ? (
                <G>
                  <Path d="M36.5 58Q45.5 56 53 52.5" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={54.5} cy={52} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                  <Path d="M56.5 51.2 59.6 50" fill="none" stroke="#F0D9C8" strokeWidth={2} strokeLinecap="round" />
                </G>
              ) : null}
              {look === 'choir' ? <Ellipse cx={30} cy={52.5} rx={9} ry={3} fill="#FFFDF8" stroke="#B9ACA1" strokeWidth={0.8} /> : null}
              {host && (pose === 'host' || present) ? (
                // The presenting arm, raised to the side when its post is centered.
                <G transform={present ? 'rotate(-86 36.5 58)' : ''}>
                  <Path d="M36.5 58Q41 66 40.5 75" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Ellipse cx={40.6} cy={77.8} rx={2.3} ry={3.8} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                  <Path d="M38.9 81l-1 1.7M40.6 81.5v1.9M42.3 81l1 1.7" fill="none" stroke={SKIN_LINE} strokeWidth={0.7} strokeLinecap="round" />
                </G>
              ) : null}
              {pull && !present ? (
                // Both hands up on the rope, hauling the prayer toward heaven.
                <G>
                  <Path d="M23.5 58Q33 52 42.5 44" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={43.5} cy={43} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                  <Path d="M36.5 58Q43 50 48.5 40" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
                  <Circle cx={49.5} cy={38.5} r={3} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.7} />
                </G>
              ) : null}
              {free && look === 'garden' ? <Flower x={18.5} y={81.2} /> : null}
              {free && look === 'dove' ? <Dove x={17} y={79} /> : null}
              {free && look === 'choir' ? (
                <G>
                  <Rect x={13} y={73} width={9.5} height={11} rx={1} fill="#CDBDDC" stroke="#8E78A6" strokeWidth={0.8} />
                  <Path d="M15 76h5.5M15 78.5h5.5" stroke="#F4EEF8" strokeWidth={0.9} />
                </G>
              ) : null}
            </G>
          ) : (
            <G>
              <Ellipse cx={24} cy={92} rx={5} ry={2.6} fill="#B9A0B2" />
              <Ellipse cx={36} cy={92} rx={5} ry={2.6} fill="#B9A0B2" />
              <Path d="M17 72Q30 60 43 72L47 91Q30 95 13 91Z" fill={dress} stroke={dressLine} strokeWidth={0.9} />
              <Path d="M20 70Q19.5 78 27 79M40 70Q40.5 78 33 79" fill="none" stroke={dress} strokeWidth={6} strokeLinecap="round" />
              <Path d="M27.4 80 30 68.6 32.6 80Z" fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.8} strokeLinejoin="round" />
              {look === 'choir' ? <Ellipse cx={30} cy={64.5} rx={9} ry={3} fill="#FFFDF8" stroke="#B9ACA1" strokeWidth={0.8} /> : null}
              {look === 'choir' ? (
                <G>
                  <Path d="M21 72.5 30 75l9-2.5V81l-9 2.5L21 81Z" fill="#FFFDF8" stroke="#9C88B3" strokeWidth={0.9} strokeLinejoin="round" />
                  <Path d="M30 75v8.5M23 75.5l5 1.3M23 78l5 1.3M32 76.8l5-1.3M32 79.3l5-1.3" stroke="#CFC2DD" strokeWidth={0.7} />
                </G>
              ) : null}
              {look === 'garden' ? (
                <G>
                  <Path d="M10 92c0-4 1-7 3-9" fill="none" stroke="#B9CDB4" strokeWidth={1} />
                  <Flower x={13.5} y={82.4} />
                </G>
              ) : null}
              {look === 'dove' ? <Dove x={48} y={87} /> : null}
              {look === 'shepherd' ? (
                <G>
                  <Path d="M45 91v2.5M52 91v2.5" stroke="#A89788" strokeWidth={1.4} strokeLinecap="round" />
                  <Ellipse cx={49} cy={87.5} rx={8.5} ry={5.2} fill="#FBF8F3" stroke="#B5A79B" strokeWidth={0.9} />
                  <Path d="M43 86q1.5-2 3 0q1.5-2 3 0q1.5-2 3 0q1.5-2 3 0" fill="none" stroke="#E6DDD4" strokeWidth={0.8} />
                  <Circle cx={55.2} cy={82.6} r={3.6} fill="#EFE3D9" stroke="#B19F91" strokeWidth={0.8} />
                  <Path d="M55.3 82.6q.8.6 1.6 0" fill="none" stroke="#8A7478" strokeWidth={0.8} strokeLinecap="round" />
                </G>
              ) : null}
            </G>
          )}
          <G transform={head}>
            <Circle cx={30} cy={34} r={17} fill={SKIN} stroke={SKIN_LINE} strokeWidth={0.9} />
            {(pose === 'stand' || (pull && !present)) ? (
              // Looking toward the post it points at or hauls.
              <G>
                <Ellipse cx={32} cy={36} rx={1.6} ry={2.2} fill="#45363B" />
                <Ellipse cx={39.5} cy={36} rx={1.6} ry={2.2} fill="#45363B" />
                <Path d="M34 43q2 1.5 4 0" fill="none" stroke="#A0716B" strokeWidth={0.8} strokeLinecap="round" />
              </G>
            ) : host && present ? (
              <G>
                <Ellipse cx={33} cy={35.5} rx={1.6} ry={2.2} fill="#45363B" />
                <Ellipse cx={40.5} cy={35.5} rx={1.6} ry={2.2} fill="#45363B" />
                <Path d="M33.5 42q2.8 2.4 5.6 0" fill="none" stroke="#A0716B" strokeWidth={0.9} strokeLinecap="round" />
              </G>
            ) : (
              // Eyes closed in quiet prayer.
              <G>
                <Path d="M22.5 36q2.5 2.2 5 0M32.5 36q2.5 2.2 5 0" fill="none" stroke="#45363B" strokeWidth={1.1} strokeLinecap="round" />
                <Path d="M28.2 42q1.8 1.3 3.6 0" fill="none" stroke="#A0716B" strokeWidth={0.8} strokeLinecap="round" />
              </G>
            )}
            <Circle cx={22} cy={40.5} r={2.6} fill="#F2B4AA" opacity={0.55} />
            <Circle cx={40} cy={40.5} r={2.6} fill="#F2B4AA" opacity={0.55} />
            {look === 'angel' ? (
              <G>
                <Path d="M13 33Q12 16 30 16Q48 16 47 33Q44 25 37 24Q34 27 30 24Q26 27 23 24Q16 25 13 33Z" fill="#EFDCAE" stroke="#C2A66A" strokeWidth={0.8} />
                <Ellipse cx={30} cy={11} rx={11} ry={2.8} fill="none" stroke="#C9A75E" strokeWidth={1.8} />
              </G>
            ) : null}
            {look === 'garden' ? (
              <G>
                <Path d="M14 37Q12 23 20 20H40Q48 23 46 37Q44 31 42 29H18Q16 31 14 37Z" fill="#C9A48C" />
                <Path d="M16 25Q17 11 30 11Q43 11 44 25Z" fill="#F4D9D3" stroke="#BF9A91" strokeWidth={0.8} />
                <Ellipse cx={30} cy={25} rx={21} ry={5} fill="#F4D9D3" stroke="#BF9A91" strokeWidth={0.8} />
                <Path d="M16.5 21.5Q30 18.5 43.5 21.5" fill="none" stroke="#E9B9C4" strokeWidth={2} />
              </G>
            ) : null}
            {look === 'shepherd' ? (
              <G>
                <Path d="M12 36Q12 14 30 14Q48 14 48 36L46 48Q44 30 30 27Q16 30 14 48Z" fill="#EFE6CB" stroke="#B8A678" strokeWidth={0.8} />
                <Path d="M14 28Q30 22 46 28" fill="none" stroke="#C9B184" strokeWidth={2} />
              </G>
            ) : null}
            {look === 'dove' ? (
              <G>
                <Circle cx={12} cy={31} r={4.6} fill="#A8826C" stroke="#8A6753" strokeWidth={0.8} />
                <Circle cx={48} cy={31} r={4.6} fill="#A8826C" stroke="#8A6753" strokeWidth={0.8} />
                <Path d="M13 33Q12 16 30 16Q48 16 47 33Q45 25 38 23Q30 27 22 23Q15 25 13 33Z" fill="#A8826C" stroke="#8A6753" strokeWidth={0.8} />
                <Path d="M14.5 27.5l-3.5-2.5M45.5 27.5l3.5-2.5" stroke="#E9B9C4" strokeWidth={1.6} strokeLinecap="round" />
              </G>
            ) : null}
            {look === 'choir' ? <Path d="M13 34Q12 16 30 16Q48 16 47 34Q46 26 41 24Q36 28 30 25Q24 28 19 24Q14 26 13 34Z" fill="#C9A48C" stroke="#97735D" strokeWidth={0.8} /> : null}
          </G>
        </G>
      </G>
    </Svg>
  );
}
