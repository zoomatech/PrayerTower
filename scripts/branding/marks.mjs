// Icon and splash options for Prayer Tower. Each mark is drawn in a 100x100
// box, in one color, so the same drawing serves the app icon, the Android
// adaptive and monochrome layers, the splash image and the favicon.
// Add an option here, then run `npm run brand -- <name>`.

export const PURPLE = '#5B3E96';
export const PURPLE_DEEP = '#3B2566';
export const GOLD = '#E9C46A';

const tower = (c) => `
  <g fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round">
    <path d="M34 22a22 22 0 0 0 0 26"/><path d="M27 16a31 31 0 0 0 0 38"/>
    <path d="M66 22a22 22 0 0 1 0 26"/><path d="M73 16a31 31 0 0 1 0 38"/>
  </g>
  <g fill="${c}">
    <circle cx="50" cy="35" r="4.2"/>
    <path d="M47.6 41h4.8l8.6 47h-6.2l-1.5-9h-6.6l-1.5 9h-6.2z M46.8 73h6.4l-1.2-8h-4z M48 60h4l-.9-6h-2.2z"/>
    <rect x="34" y="86" width="32" height="4" rx="2"/>
  </g>`;

const cross = (c) => `
  <g stroke="${c}" stroke-width="2.6" stroke-linecap="round" opacity="0.9">
    ${[30, 60, 120, 150, 210, 240, 300, 330].map((deg) => {
      const a = (deg * Math.PI) / 180;
      const [x1, y1, x2, y2] = [50 + 22 * Math.cos(a), 40 + 22 * Math.sin(a), 50 + 31 * Math.cos(a), 40 + 31 * Math.sin(a)];
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
    }).join('')}
  </g>
  <g fill="${c}">
    <rect x="45" y="14" width="10" height="74" rx="2.5"/>
    <rect x="31" y="33" width="38" height="10" rx="2.5"/>
  </g>`;

const offering = (c) => `
  <g fill="${c}">
    <path d="M50 10c3 10 15 17 15 30a15 15 0 0 1-30 0c0-7 3-11 7-15 0 5 2 8 5 9-2-9 0-17 3-24z"/>
    <path d="M14 58c8 0 14 4 18 10 4 6 10 9 18 9s14-3 18-9c4-6 10-10 18-10-2 17-17 29-36 29S16 75 14 58z"/>
  </g>`;

export const MARKS = {
  tower: { label: 'Tower (prayer going out, like the radio prayers)', draw: tower, bg: [PURPLE, PURPLE_DEEP], color: GOLD },
  cross: { label: 'Cross of light', draw: cross, bg: [PURPLE, PURPLE_DEEP], color: GOLD },
  offering: { label: 'Hands lifting a flame (prayer offered up)', draw: offering, bg: [PURPLE, PURPLE_DEEP], color: GOLD },
};
