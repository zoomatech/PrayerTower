// The public ad-free promise (Notes Page 14 and 16: no ads, never sell what
// members share). Served at /promise, and /open-circle/promise in Open Circle's
// words, only while Admin → Notebook ideas has the promise page switched on.
import { esc, layout, type Brand } from './index.js';

const POINTS = (name: string, faith: boolean) => [
  ['No ads. Ever.', `${name} shows no ads, no sponsored posts and no paid placements. Nobody can buy a place in your feed.`],
  ['We never sell your information.', 'We don’t sell, rent or trade what you share, and we don’t share it with advertisers or data brokers.'],
  ['No ad tracking.', `${name} has no advertising trackers and no ad identifiers. We count only what we need to run the app and keep it safe.`],
  [
    'Your feed is not for sale.',
    faith
      ? 'Requests reach people through prayer, kept promises and tokens earned by praying for others. Money never decides whose request is seen, and a lack of tokens never hides a request.'
      : 'Requests reach people through support, kept promises and tokens earned by helping others. Money never decides whose request is seen, and a lack of tokens never hides a request.',
  ],
  ['Tokens never cash out.', 'Tokens can be spent or given away inside the app. They can never be turned into money.'],
  ['You can leave and take nothing with you.', 'Delete your account at any time, in the app or on the account deletion page, and we erase what you posted.'],
];

/** Why it runs on gifts instead of ads (Steve 2026-10-28). Copy also in docs/copy/DONATIONS_NOT_ADS.md. */
export const WHY_GIFTS = (name: string, faith: boolean) => [
  [
    'Ads would make you the product.',
    `An app paid for by ads earns more the longer it holds your attention, so it is built to keep you scrolling and stirred up. We want you to ${faith ? 'pray' : 'show up for someone'}, then get on with your day.`,
  ],
  [
    'Ads would decide what you see.',
    `Advertisers pay for attention, so ad-paid feeds push whatever keeps people hooked. On ${name}, a request reaches people because others ${faith ? 'prayed' : 'cared'}, not because someone paid.`,
  ],
  [
    'Ads would need your secrets.',
    `Targeted ads run on profiles built from what you share. ${faith ? 'Prayer requests' : 'Requests for support'} are some of the most private things people ever write. They are not for sale.`,
  ],
  ['Gifts keep us answerable to you.', `When the people who use ${name} pay for it, we answer to them, not to advertisers.`],
  [
    'Every gift is shared.',
    faith
      ? 'Gifts pay for the servers and the prayer radio for everyone. Everyone gets at least one radio prayer, and the rest goes out by need, as the first believers shared “with anyone who had need” (Acts 2:45). Givers can choose a person, a group, or everyone.'
      : 'Gifts pay for the servers for everyone, and help goes out by need: from each according to their generosity, to each according to their need. Givers can choose a person, a group, or everyone.',
  ],
  ['Giving is never required.', `Nobody has to give to use ${name}, and giving never buys a better place in the feed.`],
  ['More of your gift does its work.', 'We use the lowest-fee ways to give we can find, and we publish what comes in and what goes out.'],
];

/** The promise page; `brand` for Open Circle, none for Prayer Tower. */
export function promisePage(name: string, brand?: Brand) {
  const faith = !brand;
  const items = POINTS(esc(name), faith)
    .map(([h, p]) => `<div class="card"><h2>${h}</h2><p>${p}</p></div>`)
    .join('\n');
  return layout(
    `${name}: our promise`,
    `<h1>Our promise to you</h1>
<p class="lede">${esc(name)} is ad-free social media. ${faith ? 'It exists so people can pray for one another, not to sell your attention.' : 'It exists so people can look out for one another, not to sell your attention.'}</p>
${items}
<h2>How we pay for it: gifts, not ads</h2>
<p class="lede">${esc(name)} runs on gifts from the people who use it and believe in it. Here is why.</p>
${WHY_GIFTS(esc(name), faith)
  .map(([h, p]) => `<div class="card"><h2>${h}</h2><p>${p}</p></div>`)
  .join('\n')}`,
    '/promise',
    'en',
    brand,
  );
}
