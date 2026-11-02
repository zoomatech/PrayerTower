import { describe, expect, it } from 'vitest';
import { orderFeed, pickPinned, rankFeed, type Candidate } from '../src/modules/feed/index.js';

const now = new Date('2026-10-25T12:00:00Z');
const base = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  postType: 'prayer_request',
  realm: null,
  createdAt: new Date(now.getTime() - 3_600_000),
  urgency: 0,
  followed: false,
  commitments: 0,
  prayingNowTaps: 0,
  reach: 0,
  ...over,
});

describe('FeedRanker', () => {
  it('follows the member\'s prayer mix without hiding anything', () => {
    const list = [base('request'), base('praise', { postType: 'praise' }), base('world', { realm: 'world' })];
    const ranked = rankFeed(list, now, { 'type:prayer_request': 'less', 'realm:world': 'less', 'type:praise': 'more' });
    expect(ranked.map((c) => c.id)).toEqual(['praise', 'request', 'world']);
    expect(rankFeed(list, now, { 'realm:world': 'more' })[0]!.id).toBe('world');
  });

  it('ranks five commitments above fifty Praying Now taps (Business Plan 3.3)', () => {
    const ranked = rankFeed([base('taps', { prayingNowTaps: 50 }), base('commits', { commitments: 5 })], now);
    expect(ranked.map((c) => c.id)).toEqual(['commits', 'taps']);
  });

  it('weights commitments above the same number of taps', () => {
    const ranked = rankFeed([base('taps', { prayingNowTaps: 3 }), base('commits', { commitments: 3 })], now);
    expect(ranked.map((c) => c.id)).toEqual(['commits', 'taps']);
  });

  it('favors people you follow and newer posts', () => {
    expect(rankFeed([base('stranger'), base('friend', { followed: true })], now)[0]!.id).toBe('friend');
    const old = base('old', { createdAt: new Date(now.getTime() - 72 * 3_600_000) });
    expect(rankFeed([old, base('new')], now)[0]!.id).toBe('new');
  });

  it('never drops a post, whatever its tokens', () => {
    const list = [base('a', { reach: 1000 }), base('b'), base('c', { postType: 'testimony' })];
    expect(rankFeed(list, now)).toHaveLength(3);
  });

  it('pins the newest prayer request or thanksgiving', () => {
    const list = [
      base('testimony', { postType: 'testimony', createdAt: now }),
      base('praise', { postType: 'praise', createdAt: new Date(now.getTime() - 60_000) }),
      base('request'),
    ];
    expect(pickPinned(list)!.id).toBe('praise');
  });

  it("never pins the viewer's own request as \"Pray for this first\"", () => {
    const list = [base('mine', { createdAt: now, mine: true }), base('theirs', { createdAt: new Date(now.getTime() - 60_000) })];
    expect(pickPinned(list)!.id).toBe('theirs');
  });

  it('puts the post the viewer just made at the top of their own feed, above the pin', () => {
    const list = [
      base('popular', { commitments: 50, createdAt: now }),
      base('theirs', { createdAt: new Date(now.getTime() - 30_000) }),
      base('mine-older', { mine: true, createdAt: new Date(now.getTime() - 5 * 60_000) }),
      base('mine-new', { mine: true, createdAt: new Date(now.getTime() - 10_000) }),
    ];
    const { ordered, pinned } = orderFeed(list, now);
    expect(ordered.map((c) => c.id).slice(0, 2)).toEqual(['mine-new', 'mine-older']);
    expect(pinned!.id).toBe('popular');
    expect(ordered).toHaveLength(4);
  });

  it('lets an own post rejoin the ranking once it is no longer new', () => {
    const list = [base('mine', { mine: true, createdAt: new Date(now.getTime() - 60 * 60_000) }), base('theirs', { createdAt: now })];
    expect(orderFeed(list, now).ordered[0]!.id).toBe('theirs');
  });
});
