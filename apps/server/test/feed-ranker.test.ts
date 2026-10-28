import { describe, expect, it } from 'vitest';
import { pickPinned, rankFeed, type Candidate } from '../src/modules/feed/index.js';

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
});
