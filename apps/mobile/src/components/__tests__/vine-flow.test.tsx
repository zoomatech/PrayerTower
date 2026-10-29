// The drawn vine: one tall stalk (edge on a phone, middle on a wide lane), and leaf boxes that keep text readable.
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';

import { leafBox, vineGeometry } from '@/components/vine-flow';
import { vineTokens } from '@/layouts/vine';

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

  it('tints the box toward the leaf only while dark text stays at 4.5:1', () => {
    for (const leaf of ['#8CC152', '#D9B648', '#2E4A1F']) {
      const look = vineTokens({ tokens: { leaf, leafSoft: '#EEF7E3' } } as never);
      expect(contrastRatio(leafBox(look), COMMENT_TEXT)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
