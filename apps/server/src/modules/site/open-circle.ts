// Open Circle's public website: the ad-free, non-religious edition (Steve,
// 2026-10-28; docs/OPEN_CIRCLE.md). Its own landing, support, privacy and terms
// pages, in plain English with no religious words. They are served at the root
// for the hostnames in OPEN_CIRCLE_HOSTS, and always under /open-circle, so the
// Open Circle app's listing can link to them before it has its own domain.
// The name is a placeholder (OPEN_CIRCLE_NAME) until Steve picks one.
import path from 'node:path';
import { crisisLine } from '@prayer-tower/shared';
import { esc, layout, legalDoc, storeButtons, type Brand, type OpenCircleSite, type SiteOptions } from './index.js';

/** Under the Prayer Tower domain, Open Circle's pages live here. */
export const PREFIX = '/open-circle';

/** The same "open circle" mark as the app icon (scripts/branding/marks.mjs, "circle"). */
export const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="oc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D6F6A"/><stop offset="1" stop-color="#12464A"/></linearGradient></defs><rect width="100" height="100" fill="url(#oc)"/><g transform="translate(14 14) scale(.72)"><g fill="#F6C28B"><circle cx="71.2" cy="28.8" r="8"/><circle cx="80" cy="50" r="8"/><circle cx="71.2" cy="71.2" r="8"/><circle cx="50" cy="80" r="8"/><circle cx="28.8" cy="71.2" r="8"/><circle cx="20" cy="50" r="8"/><circle cx="28.8" cy="28.8" r="8"/></g><circle cx="50" cy="20" r="6.5" fill="none" stroke="#F6C28B" stroke-width="3"/></g></svg>`;

const CSS = `
  :root { --fg: #1E2B2A; --muted: #4F5E5C; --bg: #F6F8F5; --line: #DCE5E1; --accent: #1D6F6A; --gold: #B5651D; }
  @media (prefers-color-scheme: dark) { :root { --fg: #E6F0EE; --muted: #A9BBB7; --bg: #101B1A; --card: #182725; --line: #2C3F3C; --accent: #7FD1C7; --gold: #F6C28B; } }
  @media (prefers-color-scheme: dark) { .button { color: #101B1A; } }`;

export function brand(o: OpenCircleSite, base: string): Brand {
  return {
    name: o.name,
    base,
    css: CSS,
    logo: LOGO,
    footer: `${esc(o.name)} is not an emergency service. If you are in danger, call 911.`,
  };
}

/** The four pages and the shared-link page, built once for one base ('' or PREFIX). */
export function pages(opts: SiteOptions, o: OpenCircleSite, base: string) {
  const b = brand(o, base);
  const name = esc(o.name);
  const p = (page: string) => (page === '/' ? base || '/' : `${base}${page}`);
  const stores = storeButtons({ appStoreUrl: o.appStoreUrl, playStoreUrl: null }, 'en');

  const landing = layout(
    `${o.name}: look out for one another`,
    `<h1>Look out for one another.</h1>
<p class="lede">${name} is a small, kind place to ask for support and to lift other people up. No ads, no selling your information, and no outrage.</p>
${stores || `<p class="notice">${name} is in a small, invite-only pilot. Thank you for your patience while we learn together.</p>`}
<div class="card"><h2>Ask for support</h2><p>Share what's going on in a few words, with your name or anonymously. You'll see when people are thinking of you, and you can thank them.</p></div>
<div class="card"><h2>Lift someone up</h2><p>Read real requests from real people and tap "Thinking of You" to let them know. Promise to check in, and ${name} will gently remind you.</p></div>
<div class="card"><h2>Share good news</h2><p>Celebrate wins, big and small, and tell the stories of everyday kindness that make a day better.</p></div>
<div class="card"><h2>Kind by design</h2><p>Groups, meet-ups and listening partners, with clear community rules, reporting, blocking and real moderators. There are no ads, and we never sell your information.</p></div>`,
    '/',
    'en',
    b,
  );

  const line = crisisLine(opts.crisisCountry);
  const email = o.supportEmail ?? opts.supportEmail;
  const support = layout(
    `${o.name} support`,
    `<h1>Support</h1>
<div class="notice"><p><strong>If you or someone you love is in crisis</strong>, ${esc(line.reach)} (${esc(line.name)}). If you are in danger, call 911.</p></div>
<h2>Contact us</h2>
${email ? `<p>Email <a href="mailto:${esc(email)}">${esc(email)}</a>. We usually answer within two days.</p>` : '<p>In the app, go to <strong>Me → Send feedback</strong>. The pilot team reads every message.</p>'}
<p>You can also send feedback from inside the app: <strong>Me → Send feedback</strong>.</p>
<h2>Report or block</h2>
<p>Open a request, comment or message and choose <strong>Report</strong>. Moderators review every report. To stop seeing someone, open their profile and choose <strong>Block</strong>. If we remove something you posted, we tell you which rule it broke, and you can appeal in the app.</p>
<h2>Delete your account</h2>
<p>In the app, go to <strong>Me → Delete my account</strong>, or use the <a href="${p('/account-deletion')}">account deletion page</a>.</p>
<h2>Policies</h2>
<p><a href="${p('/privacy')}">Privacy policy</a> · <a href="${p('/terms')}">Terms of use</a></p>`,
    '/support',
    'en',
    b,
  );

  const legal = (which: 'privacy' | 'terms') => {
    const title = which === 'privacy' ? 'Privacy policy' : 'Terms of use';
    // docs/legal/open-circle holds its own drafts, with {{NAME}} where the name goes.
    const doc = legalDoc(opts.legalDir ? path.join(opts.legalDir, 'open-circle') : null, which === 'privacy' ? 'PRIVACY_POLICY' : 'TERMS_OF_USE');
    if (!doc) return { status: 404, html: layout(title, `<h1>${title}</h1><p>This page isn't published yet.</p>`, `/${which}`, 'en', b) };
    return { status: 200, html: layout(`${o.name} ${title.toLowerCase()}`, doc.html.replaceAll('{{NAME}}', name), `/${which}`, 'en', b) };
  };

  /** A shared request or comment link, for someone without the app: it never shows the request itself. */
  const shared = (postId: string, commentId: string | null) => {
    const deep = `opencircle://post/${encodeURIComponent(postId)}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ''}`;
    return layout(
      commentId ? `A comment on ${o.name}` : `A request on ${o.name}`,
      `<h1>${commentId ? 'Someone shared a comment with you.' : 'Someone could use your support.'}</h1>
<p class="lede">Open it in the ${name} app to read it.</p>
<p><a class="button" href="${esc(deep)}">Open in ${name}</a></p>
${stores ? `<p>Don't have the app yet?</p>${stores}` : `<p class="notice">${name} is in a small, invite-only pilot. If you have been invited, install the app from your invitation, then open this link again.</p>`}`,
      '',
      'en',
      b,
    );
  };

  return { landing, support, privacy: legal('privacy'), terms: legal('terms'), shared, brand: b };
}

/** Whether a request came in on one of Open Circle's own domains. */
export function isOpenCircleHost(o: OpenCircleSite | null | undefined, hostname: string) {
  return !!o && o.hosts.includes(hostname.toLowerCase());
}
