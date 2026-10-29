// The App Store listing that `eas metadata:push` uploads (store.config.js) fits Apple's limits
// for both editions, and Open Circle's has no religious words.
/* eslint-disable @typescript-eslint/no-require-imports */
const { listing, problems } = require('../../store/listing');
const storeConfig = require('../../store.config');

const editions = ['prayer-tower', 'open-circle'] as const;

describe('store listing', () => {
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_EDITION;
    delete process.env.STORE_SITE_URL;
    delete process.env.REVIEW_EMAIL;
    delete process.env.REVIEW_PASSWORD;
  });

  it.each(editions)('%s fits Apple’s limits', (edition) => {
    const l = listing(edition, { withWhatsNew: true });
    expect(l.problems).toEqual([]);
    expect(l.info.title).toBeTruthy();
    expect(l.info.description.length).toBeGreaterThan(100);
    expect(l.notes).not.toMatch(/\[PASSWORD\]|Review account:/);
  });

  it('flags a listing over the limits', () => {
    const info = { title: 'x'.repeat(31), subtitle: 'ok', promoText: 'ok', description: 'ok', keywords: ['a'.repeat(60), 'b'.repeat(60)] };
    expect(problems(info, 'notes')).toEqual(['title is 31 characters (limit 30)', 'keywords are 121 bytes (limit 100)']);
  });

  it('keeps religious words out of Open Circle’s listing', () => {
    const { info, notes } = listing('open-circle');
    const text = [info.title, info.subtitle, info.promoText, info.description, info.keywords.join(' '), notes].join(' ');
    expect(text).not.toMatch(/\b(pray\w*|god|jesus|christ\w*|church|bible|faith|ministry|priest\w*|pastor)\b/i);
  });

  it('builds the config with addresses and the review sign-in from the environment', () => {
    process.env.EXPO_PUBLIC_EDITION = 'open-circle';
    process.env.STORE_SITE_URL = 'https://api.example.org/';
    process.env.REVIEW_EMAIL = 'review@example.org';
    process.env.REVIEW_PASSWORD = 'pw';
    const { apple } = storeConfig();
    expect(apple.categories[0]).toBe('SOCIAL_NETWORKING');
    expect(apple.info['en-US'].supportUrl).toBe('https://api.example.org/open-circle/support');
    expect(apple.review.demoPassword).toBe('pw');
    expect(apple.review.notes).not.toContain('pw');
  });

  it('leaves the review contact out until it is set', () => {
    expect(storeConfig().apple.review).toBeUndefined();
    expect(storeConfig().apple.info['en-US'].supportUrl).toBeUndefined();
  });
});
