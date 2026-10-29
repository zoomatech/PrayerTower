// The drawn vine: one tall stalk (edge on a phone, middle on a wide lane), and leaf boxes that keep text readable.
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';

import { tabletFace } from '@/components/stone-tablet';
import { doorway, isLit, leafBox, vineGeometry } from '@/components/vine-flow';
import { vineTokens } from '@/layouts/vine';
import { colors } from '@/lib/theme';

describe('Drawn vine', () => {
  it('runs the stalk down the edge on a phone and the middle on a wide lane', () => {
    const phone = vineGeometry(358, 'left', 0);
    expect(phone.centered).toBe(false);
    expect(phone.stalkX).toBeLessThan(phone.leafLeft);
    expect(vineGeometry(358, 'right', 1).leafLeft).toBeGreaterThan(phone.leafLeft);
    const wide = vineGeometry(880, 'left', 0);
    expect(wide.centered).toBe(true);
    expect(wide.leafLeft + wide.leafWidth).toBeLessThan(wide.stalkX);
    expect(vineGeometry(880, 'right', 0).leafLeft).toBeGreaterThan(wide.stalkX);
  });

  it('tints the box toward the leaf only while dark, muted and link text stay at 4.5:1', () => {
    for (const leaf of ['#8CC152', '#D9B648', '#2E4A1F']) {
      const look = vineTokens({ tokens: { leaf, leafSoft: '#EEF7E3' } } as never);
      for (const text of [COMMENT_TEXT, colors.textMuted, colors.primary]) expect(contrastRatio(leafBox(look), text)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Moonlit Gate and the Prayer Tower drawings', () => {
  it('draws Moonlit Gate in light, with a pale doorway box that keeps text readable', () => {
    const look = vineTokens({ tokens: { vineStyle: 'gate', leafSoft: '#EEF3FA' } } as never);
    expect(look.vineStyle).toBe('gate');
    expect(isLit(look.vineStyle)).toBe(true);
    expect(isLit('beanstalk')).toBe(false);
    for (const text of [COMMENT_TEXT, colors.textMuted, colors.primary]) expect(contrastRatio(leafBox(look), text)).toBeGreaterThanOrEqual(4.5);
    // The doorway is closed and its arch peaks in the middle.
    expect(doorway(200, 120, 3, 40)).toMatch(/^M 3 117 .* Z$/);
    expect(doorway(200, 120, 3, 40)).toContain('100 3');
  });

  it('carves tower text on a tablet face that keeps every card text color at 4.5:1', () => {
    for (const stone of ['#B9AE9C', '#6E6455', '#D8CFC0', '#8F8574']) {
      for (const text of [COMMENT_TEXT, colors.textMuted, colors.primary]) expect(contrastRatio(tabletFace(stone), text)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
