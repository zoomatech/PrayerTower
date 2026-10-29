// The drawn vine: one tall stalk (edge on a phone, middle on a wide lane), and leaf boxes that keep text readable.
import { COMMENT_TEXT, contrastRatio } from '@prayer-tower/shared';

import { tabletFace } from '@/components/stone-tablet';
import { vineRows } from '@/components/comment-tree';
import { blossomPetals, doorway, isLit, leafBox, vineGeometry } from '@/components/vine-flow';
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

describe('Blossom Garden and the frosted overflow', () => {
  it('draws Blossom Garden as a climbing rose with readable petal frames', () => {
    const look = vineTokens({ tokens: { vineStyle: 'floral', leaf: '#F48FB1', leafSoft: '#FFF0F5' } } as never);
    expect(look.vineStyle).toBe('floral');
    expect(isLit(look.vineStyle)).toBe(false);
    for (const text of [COMMENT_TEXT, colors.textMuted, colors.primary]) expect(contrastRatio(leafBox(look), text)).toBeGreaterThanOrEqual(4.5);
    // Five closed petals.
    expect(blossomPetals(50, 50, 10).match(/Z/g)).toHaveLength(5);
  });

  it('puts the next older comments behind the "more" row, newest first', () => {
    const c = (id: string, mins: number) => ({ id, parentId: null, body: id, createdAt: new Date(Date.UTC(2026, 9, 29, 0, mins)).toISOString(), author: { displayName: id } }) as never;
    const tree = new Map([[null, [c('a', 1), c('b', 2), c('c', 3), c('d', 4), c('e', 5)]]]);
    const rows = vineRows(tree as never, new Set(), 2);
    const more = rows.find((r) => r.kind === 'more');
    expect(more && more.kind === 'more' && more.peek.map((p) => p.id)).toEqual(['c', 'b']);
  });
});
