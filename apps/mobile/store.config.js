// App Store listing for `eas metadata:push` (EAS Metadata, https://docs.expo.dev/eas/metadata/).
// The words come from docs/store/ (store/listing.js); the addresses and the
// review contact come from the environment, so nothing private is in the repo.
// EXPO_PUBLIC_EDITION=open-circle pushes Open Circle's listing to its own app.
//
//   STORE_SITE_URL      https://api.<domain> (Support, Privacy and Marketing URLs; Open Circle uses /open-circle)
//   STORE_COPYRIGHT     e.g. "2026 Zoomatech" (default: this year and [LEGAL NAME OF OPERATOR])
//   REVIEW_FIRST_NAME, REVIEW_LAST_NAME, REVIEW_EMAIL, REVIEW_PHONE (+1 …)  App Review contact
//   REVIEW_ACCOUNT, REVIEW_PASSWORD   the review sign-in (npm run review-account on the server)
//   STORE_WHATS_NEW=1   adds the update text from WHATS_NEW.md (not for version 1.0)
const { listing } = require('./store/listing');

module.exports = () => {
  const edition = process.env.EXPO_PUBLIC_EDITION === 'open-circle' ? 'open-circle' : 'prayer-tower';
  const { info, notes, problems } = listing(edition, { withWhatsNew: process.env.STORE_WHATS_NEW === '1' });
  if (problems.length) throw new Error(`The ${edition} store listing doesn't fit Apple's limits: ${problems.join('; ')}`);

  const env = process.env;
  const site = env.STORE_SITE_URL?.replace(/\/$/, '');
  const base = site && (edition === 'open-circle' ? `${site}/open-circle` : site);
  const urls = base ? { supportUrl: `${base}/support`, privacyPolicyUrl: `${base}/privacy`, marketingUrl: `${base}/` } : {};
  const review = env.REVIEW_EMAIL
    ? {
        firstName: env.REVIEW_FIRST_NAME,
        lastName: env.REVIEW_LAST_NAME,
        email: env.REVIEW_EMAIL,
        phone: env.REVIEW_PHONE,
        demoUsername: env.REVIEW_ACCOUNT,
        demoPassword: env.REVIEW_PASSWORD,
        demoRequired: true,
        notes,
      }
    : undefined;

  return {
    configVersion: 0,
    apple: {
      copyright: env.STORE_COPYRIGHT || `${new Date().getFullYear()} [LEGAL NAME OF OPERATOR]`,
      // Steve to confirm (STORE_LISTING.md): Prayer Tower is Lifestyle first, Open Circle Social Networking first.
      categories: edition === 'open-circle' ? ['SOCIAL_NETWORKING', 'LIFESTYLE'] : ['LIFESTYLE', 'SOCIAL_NETWORKING'],
      info: { 'en-US': { ...info, ...urls } },
      ...(review && { review }),
    },
  };
};
