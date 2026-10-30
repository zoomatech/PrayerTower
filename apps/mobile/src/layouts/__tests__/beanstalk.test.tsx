// The Beanstalk, ported from Steve's Claude Design file: the frame vine, the stalk and leaves below each post, the sway.
import { COMMENT_TEXT, contrastRatio, type Comment } from '@prayer-tower/shared';

import { BEANSTALK, commentTree, fitText, frameVine, frameWidth, hanging, leafChars, maxShift, PER_PAGE, postShift } from '@/layouts/beanstalk';

const c = (id: string, mins: number, parentId: string | null = null, body = id) =>
  ({ id, parentId, body, isUpdate: false, createdAt: new Date(Date.UTC(2026, 9, 30, 0, mins)).toISOString(), author: { displayName: id } }) as unknown as Comment;

const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('Beanstalk drawing', () => {
  it('winds the frame vine up both sides from the bottom middle to the flower at the top, with room for every leaf', () => {
    const w = 360;
    const h = 240;
    const vine = frameVine(w, h);
    expect(vine.w).toBe(w + 52);
    expect(vine.h).toBe(h + 52);
    for (const d of [...vine.s1, ...vine.s2]) {
      const xs = nums(d);
      // Starts at the bottom middle and ends at the top middle.
      expect(xs[0]).toBeCloseTo(26 + w / 2, 0);
      expect(xs[1]).toBeCloseTo(26 + h, 0);
      expect(xs[xs.length - 2]).toBeCloseTo(26 + w / 2, 0);
      expect(xs[xs.length - 1]).toBeCloseTo(26, 0);
    }
    // Nothing reaches past the drawing's box, so no leaf or tendril is ever cut off.
    for (const d of [...vine.la, ...vine.lb, vine.tendrils, vine.flower]) {
      const xs = nums(d.replace(/a5 5 0 1 0 (-?)10 0/g, ''));
      for (let i = 0; i + 1 < xs.length; i += 2) {
        expect(xs[i]).toBeGreaterThanOrEqual(0);
        expect(xs[i]).toBeLessThanOrEqual(vine.w);
        expect(xs[i + 1]).toBeGreaterThanOrEqual(0);
        expect(xs[i + 1]).toBeLessThanOrEqual(vine.h);
      }
    }
    expect(vine.la.filter((d) => d !== 'M0 0').length).toBe(5);
  });

  it('keeps the leaf text and the reply link readable on every leaf (4.5:1)', () => {
    for (const leaf of [BEANSTALK.leafA, BEANSTALK.leafB, BEANSTALK.leafC]) {
      expect(contrastRatio(COMMENT_TEXT, leaf)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(BEANSTALK.link, leaf)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('sets each post off the centre line by turns, never more than 15%, and keeps it and its vine on the screen', () => {
    for (const lane of [320, 375, 430, 760]) {
      const room = (lane - frameWidth(lane)) / 2;
      expect(maxShift(lane)).toBeLessThanOrEqual(lane * 0.15);
      // The vine (26) and the locket (29) stay on the screen.
      expect(room - maxShift(lane)).toBeGreaterThanOrEqual(30);
      const shifts = ['a', 'bb', 'ccc', 'dddd'].map((id, i) => postShift(id, i, lane));
      expect(shifts.map(Math.sign)).toEqual([-1, 1, -1, 1].map((s) => (maxShift(lane) ? s : 0)));
    }
  });
});

describe('Beanstalk leaves', () => {
  it('cuts long words off with ".." and leaves short ones whole', () => {
    expect(fitText('He answers prayer.', 40)).toEqual({ text: 'He answers prayer.', cut: false });
    const long = fitText('Praying for you and your family tonight. You are not alone in this.', 40);
    expect(long.cut).toBe(true);
    expect(long.text.endsWith('..')).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(40);
    expect(leafChars(280, 14, 2)).toBeGreaterThan(leafChars(170, 14, 2));
  });

  it('hangs three leaves at a time below the post, left then right, and sprouts an open leaf’s replies three levels deep', () => {
    const all = [c('a', 1), c('b', 2), c('c', 3), c('d', 4), c('r1', 5, 'd'), c('r2', 6, 'd'), c('r3', 7, 'd'), c('r4', 8, 'd'), c('rr', 9, 'r1'), c('rrr', 10, 'rr')];
    const { top, kids } = commentTree(all);
    expect(top.map((x) => x.id)).toEqual(['d', 'c', 'b', 'a']);
    const closed = hanging(360, top, kids, { page: 0, open: null, open2: null }, 0);
    expect(closed.leaves.map((l) => l.comment.id)).toEqual(['d', 'c', 'b']);
    expect(closed.leaves.map((l) => l.side)).toEqual([-1, 1, -1]);
    expect(closed.pager).toBe(true);
    expect(closed.pages).toBe(2);
    // The second page.
    expect(hanging(360, top, kids, { page: 1, open: null, open2: null }, 0).leaves.map((l) => l.comment.id)).toEqual(['a']);
    const open = hanging(360, top, kids, { page: 0, open: 0, open2: 0 }, 0);
    expect(open.leaves.map((l) => `${l.comment.id}:${l.level}`)).toEqual(['d:1', 'c:1', 'b:1', 'r1:2', 'rr:3', 'r2:2', 'r3:2']);
    expect(open.leaves.filter((l) => l.level === 2)).toHaveLength(PER_PAGE);
    expect(open.H).toBeGreaterThan(closed.H);
  });

  it('bends the stalk below a post over to where the next post sits', () => {
    const { top, kids } = commentTree([c('a', 1)]);
    const straight = hanging(360, top, kids, { page: 0, open: null, open2: null }, 0, 0);
    const bent = hanging(360, top, kids, { page: 0, open: null, open2: null }, 0, 40);
    const end = (d: string) => nums(d).slice(-2);
    expect(end(straight.s1)).toEqual([180, straight.H]);
    expect(end(bent.s1)).toEqual([220, bent.H]);
    expect(nums(bent.s1).slice(0, 2)).toEqual([180, 0]);
  });
});
