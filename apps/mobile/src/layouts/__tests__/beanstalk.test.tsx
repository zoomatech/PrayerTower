// The Beanstalk, drawn to match the Claude Design video: braided stalk, leaves three at a time, replies three levels deep.
import { COMMENT_TEXT, contrastRatio, type Comment } from '@prayer-tower/shared';

import { BEANSTALK, braid, clusterRows, commentTree, fitText, frameVine, leafChars, leafShape, MAX_LEVEL, PER_PAGE, roundedRectEdge } from '@/layouts/beanstalk';

const c = (id: string, mins: number, parentId: string | null = null, body = id) =>
  ({ id, parentId, body, isUpdate: false, createdAt: new Date(Date.UTC(2026, 9, 30, 0, mins)).toISOString(), author: { displayName: id } }) as unknown as Comment;

describe('Beanstalk drawing', () => {
  it('braids two strands that meet where one piece of stalk joins the next', () => {
    for (const h of [90, 240, 517]) {
      for (const phase of [0, Math.PI]) {
        const d = braid(100, h, 6, phase);
        expect(d.startsWith('M 100.0 0')).toBe(true);
        expect(d.endsWith(`100.0 ${h}`)).toBe(true);
      }
    }
  });

  it('draws a leaf with a stem, a closed body, a midrib and veins, mirrored for the left side', () => {
    const right = leafShape(200, 100, false);
    const left = leafShape(200, 100, true);
    expect(right.body).toMatch(/Z$/);
    expect(right.stem.startsWith('M 0.0 50.0')).toBe(true);
    expect(left.stem.startsWith('M 200.0 50.0')).toBe(true);
    // The tip droops below the middle.
    expect(right.midrib.endsWith('200.0 64.0')).toBe(true);
    expect(right.veins.match(/M /g)).toHaveLength(10);
  });

  it('winds the frame vine all the way round the post, with leaves and curls', () => {
    const edge = roundedRectEdge(10, 10, 300, 200, 22, 4);
    const perimeter = 2 * (300 + 200) - 8 * 22 + 2 * Math.PI * 22;
    expect(edge.length).toBeGreaterThan(perimeter / 4 - 2);
    for (const e of edge) {
      expect(e.x).toBeGreaterThanOrEqual(10 - 0.01);
      expect(e.x).toBeLessThanOrEqual(310.01);
      expect(Math.hypot(e.nx, e.ny)).toBeCloseTo(1);
    }
    const vine = frameVine(320, 220, 10);
    expect(vine.a).toMatch(/Z$/);
    expect(vine.leaves.match(/Z/g)!.length).toBeGreaterThan(20);
    expect(vine.curls.length).toBeGreaterThan(0);
  });

  it('draws the frame vine from the top left corner both ways round, closing it at the end', () => {
    expect(frameVine(320, 220, 10, 0).a).toBe('');
    const half = frameVine(320, 220, 10, 0.5);
    expect(half.a).not.toMatch(/Z$/);
    // The flower at the top middle comes before the bottom right is reached.
    expect(half.flower).toBe(true);
    expect(frameVine(320, 220, 10, 0.1).flower).toBe(false);
    expect(half.leaves.length).toBeLessThan(frameVine(320, 220, 10, 1).leaves.length);
    expect(frameVine(320, 220, 10, 1).a).toMatch(/Z$/);
  });

  it('keeps the leaf text and the reply link readable on the leaves (4.5:1)', () => {
    for (const leaf of [BEANSTALK.leaf, BEANSTALK.leafPale]) {
      expect(contrastRatio(COMMENT_TEXT, leaf)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(BEANSTALK.link, leaf)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('Beanstalk comments', () => {
  it('cuts long words off with ".." and leaves short ones whole', () => {
    expect(fitText('He answers prayer.', 40)).toEqual({ text: 'He answers prayer.', cut: false });
    const long = fitText('Praying for you and your family tonight. You are not alone in this.', 40);
    expect(long.cut).toBe(true);
    expect(long.text.endsWith('..')).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(40);
    expect(leafChars(280, 14, 2)).toBeGreaterThan(leafChars(170, 12.5, 2) - 1);
  });

  it('hangs three leaves at a time, newest first, and sprouts the first three replies of an open leaf, three levels deep', () => {
    const all = [c('a', 1), c('b', 2), c('c', 3), c('d', 4), c('r1', 5, 'd'), c('r2', 6, 'd'), c('r3', 7, 'd'), c('r4', 8, 'd'), c('rr', 9, 'r1'), c('rrr', 10, 'rr')];
    const { top, kids } = commentTree(all);
    expect(top.map((x) => x.id)).toEqual(['d', 'c', 'b', 'a']);
    const page = top.slice(0, PER_PAGE);
    expect(clusterRows(page, kids, new Set()).map((r) => r.comment.id)).toEqual(['d', 'c', 'b']);
    // Leaves alternate sides up the stalk.
    expect(clusterRows(page, kids, new Set()).map((r) => r.side)).toEqual(['left', 'right', 'left']);
    const open = clusterRows(page, kids, new Set(['d', 'r1', 'rr']));
    expect(open.map((r) => `${r.comment.id}:${r.level}`)).toEqual(['d:0', 'r1:1', 'rr:2', 'r2:1', 'r3:1', 'c:0', 'b:0']);
    // The third level is the last: a reply to a reply to a reply never sprouts.
    expect(Math.max(...open.map((r) => r.level))).toBe(MAX_LEVEL);
    expect(open.find((r) => r.comment.id === 'r1')!.side).toBe('left');
  });
});
