import { describe, expect, it } from 'vitest';
import { neutralText, RELIGIOUS_WORDS } from '../src/modules/communities/neutral-text.js';

describe('neutral text for Open Circle members', () => {
  it.each([
    ['Pray for this request first, then you can record a spoken prayer', 'Support this request first, then you can record a spoken message'],
    ['Commit to pray first, then you can write to them', 'Promise to check in first, then you can write to them'],
    ['Prayer partners and pastors only', 'Listening partners and mentors only'],
    ['You already have a request waiting. A prayer partner will be with you soon.', 'You already have a request waiting. A listening partner will be with you soon.'],
    ['Buying tokens is not available yet. You can earn tokens by praying.', 'Buying tokens is not available yet. You can earn tokens by supporting.'],
    ['Your Priestly token is back in your balance.', 'Your Lighthouse token is back in your balance.'],
    ['Someone stopped to bring your request before the Lord.', 'Someone stopped to bring your request in their thoughts.'],
    ['Ann committed to pray for you', 'Ann promised to check in for you'],
    ['Your church is verified. Churches near you can see it.', 'Your community is verified. Communities near you can see it.'],
  ])('%s', (from, to) => {
    expect(neutralText(from)).toBe(to);
    expect(RELIGIOUS_WORDS.test(neutralText(from))).toBe(false);
  });

  it('leaves neutral text alone', () => {
    expect(neutralText('Something went wrong')).toBe('Something went wrong');
  });
});
