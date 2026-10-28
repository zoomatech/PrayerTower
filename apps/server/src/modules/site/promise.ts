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
${items}`,
    '/promise',
    'en',
    brand,
  );
}
