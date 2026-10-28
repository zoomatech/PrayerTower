// The public website served by the API host: a landing page, the privacy policy
// and terms (the URLs both app stores ask for), and support/contact (Apple 1.2).
// The account-deletion page lives in ../deletion-page.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crisisLine } from '@prayer-tower/shared';
import { marked } from 'marked';

export interface SiteOptions {
  supportEmail: string | null;
  /** Folder holding PRIVACY_POLICY.md and TERMS_OF_USE.md (or their _DRAFT versions). */
  legalDir: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  crisisCountry: string | null;
  /** Universal links (iOS) and App Links (Android) for shared /post URLs; unset = not served. */
  appLinks?: AppLinks;
}

export interface AppLinks {
  /** "<TEAM_ID>.<bundle id>" for each app that may open the links. */
  appleAppIds: string[];
  androidPackages: string[];
  /** SHA-256 signing-certificate fingerprints (AB:CD:...), from EAS credentials or Play App Signing. */
  androidFingerprints: string[];
}

/** Paths the apps open. Kept in step with the app's /post/[id] route. */
export const APP_LINK_PATHS = ['/post/*'];

/** iOS: https://developer.apple.com/documentation/xcode/supporting-associated-domains */
export function appleAppSiteAssociation(l: AppLinks) {
  return {
    applinks: {
      details: [
        // iOS 13+ (components) first, then the older paths form, as Apple and Expo advise.
        { appIDs: l.appleAppIds, components: APP_LINK_PATHS.map((p) => ({ '/': p })) },
        ...l.appleAppIds.map((appID) => ({ appID, paths: APP_LINK_PATHS })),
      ],
    },
  };
}

/** Android: https://developer.android.com/training/app-links/verify-android-applinks */
export function assetLinks(l: AppLinks) {
  return l.androidPackages.map((package_name) => ({
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name, sha256_cert_fingerprints: l.androidFingerprints },
  }));
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** docs/legal in this repo, found by walking up from this file (works from src and from dist). */
export function defaultLegalDir(): string | null {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'docs', 'legal');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * A legal document as HTML. The reviewed file (NAME.md) wins over the draft
 * (NAME_DRAFT.md); a draft is shown with its "not in effect" warning, and the
 * reviewer notes for counsel are never published.
 */
export function legalDoc(dir: string | null, name: 'PRIVACY_POLICY' | 'TERMS_OF_USE'): { html: string; draft: boolean } | null {
  if (!dir) return null;
  for (const [file, draft] of [[`${name}.md`, false], [`${name}_DRAFT.md`, true]] as const) {
    const full = path.join(dir, file);
    if (!existsSync(full)) continue;
    const md = readFileSync(full, 'utf8').split(/\n---\n+## Reviewer notes/)[0]!;
    return { html: marked.parse(md, { async: false }), draft };
  }
  return null;
}

const NAV = [
  ['/', 'Home'],
  ['/support', 'Support'],
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/account-deletion', 'Delete account'],
] as const;

export function layout(title: string, body: string, current: string) {
  const nav = NAV.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; --fg: #2B2238; --muted: #5F5870; --bg: #FAF7F2; --card: #fff; --line: #E7E0D6; --accent: #5B3E96; --gold: #7D6308; }
  @media (prefers-color-scheme: dark) { :root { --fg: #EEE9F5; --muted: #B5ADC2; --bg: #17131D; --card: #221C2B; --line: #3A3245; --accent: #C4B0EC; --gold: #E9C46A; } }
  body { margin: 0; font: 17px/1.6 system-ui, sans-serif; color: var(--fg); background: var(--bg); }
  header, main, footer { max-width: 720px; margin: 0 auto; padding: 0 16px; }
  header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; padding-top: 20px; }
  .brand { font-weight: 800; font-size: 20px; color: var(--accent); text-decoration: none; }
  nav { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 15px; }
  nav a { color: var(--muted); text-decoration: none; } nav a[aria-current] { color: var(--accent); font-weight: 700; }
  main { padding-top: 16px; padding-bottom: 48px; }
  h1 { font-size: 30px; line-height: 1.25; margin: 16px 0 8px; } h2 { font-size: 21px; margin: 28px 0 8px; } h3 { font-size: 18px; }
  a { color: var(--accent); } p, li { color: var(--fg); }
  .lede { font-size: 20px; color: var(--muted); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 4px 20px 12px; margin: 20px 0; }
  .button { display: inline-block; padding: 12px 22px; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 700; text-decoration: none; margin: 6px 8px 6px 0; }
  @media (prefers-color-scheme: dark) { .button { color: #17131D; } }
  .notice { border-left: 4px solid var(--gold); padding: 8px 14px; background: var(--card); border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; display: block; overflow-x: auto; }
  th, td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
  blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid var(--gold); background: var(--card); border-radius: 8px; }
  footer { border-top: 1px solid var(--line); padding-top: 16px; padding-bottom: 32px; color: var(--muted); font-size: 14px; }
</style></head>
<body>
<header><a class="brand" href="/">Prayer Tower</a><nav aria-label="Site">${nav}</nav></header>
<main>${body}</main>
<footer>Prayer Tower is not an emergency service. If you are in danger, call 911.</footer>
</body></html>`;
}

export function landing(o: SiteOptions) {
  const stores = [
    o.appStoreUrl ? `<a class="button" href="${esc(o.appStoreUrl)}">Get it on the App Store</a>` : '',
    o.playStoreUrl ? `<a class="button" href="${esc(o.playStoreUrl)}">Get it on Google Play</a>` : '',
  ].join('');
  return layout(
    'Prayer Tower: pray for one another',
    `<h1>Pray for one another.</h1>
<p class="lede">Prayer Tower is a quiet, caring place to ask for prayer and to pray for others.</p>
${stores || '<p class="notice">Prayer Tower is in a small, invite-only pilot. Thank you for your patience while we learn together.</p>'}
<div class="card"><h2>Ask for prayer</h2><p>Share what's on your heart in a few words, with your name or anonymously. You'll see when people are praying for you, and you can thank them.</p></div>
<div class="card"><h2>Pray for others</h2><p>Read real requests from real people and tap "Praying Now" when you pray. Promise to keep praying, and Prayer Tower will gently remind you.</p></div>
<div class="card"><h2>Pray together, safely</h2><p>Groups, prayer meetings and prayer partners, with clear community rules, reporting, blocking and real moderators. There are no ads, and we never sell your information.</p></div>`,
    '/',
  );
}

/**
 * What someone without the app sees when they open a shared request or comment
 * link. It never shows the request itself (that needs a signed-in member), only
 * a button that opens the app and the store links.
 */
export function sharedPost(o: SiteOptions, postId: string, commentId: string | null) {
  const deep = `prayertower://post/${encodeURIComponent(postId)}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ''}`;
  const stores = [
    o.appStoreUrl ? `<a class="button" href="${esc(o.appStoreUrl)}">Get it on the App Store</a>` : '',
    o.playStoreUrl ? `<a class="button" href="${esc(o.playStoreUrl)}">Get it on Google Play</a>` : '',
  ].join('');
  return layout(
    commentId ? 'A comment on Prayer Tower' : 'A prayer request on Prayer Tower',
    `<h1>${commentId ? 'Someone shared a comment with you.' : 'Someone asked you to pray.'}</h1>
<p class="lede">Open it in the Prayer Tower app to read it and pray.</p>
<p><a class="button" href="${esc(deep)}">Open in Prayer Tower</a></p>
${stores ? `<p>Don't have the app yet?</p>${stores}` : '<p class="notice">Prayer Tower is in a small, invite-only pilot. If you have been invited, install the app from your invitation, then open this link again.</p>'}`,
    '',
  );
}

export function support(o: SiteOptions) {
  const line = crisisLine(o.crisisCountry);
  const contact = o.supportEmail
    ? `<p>Email <a href="mailto:${esc(o.supportEmail)}">${esc(o.supportEmail)}</a>. We usually answer within two days.</p>`
    : '<p>In the app, go to <strong>Me → Send feedback</strong>. The pilot team reads every message.</p>';
  return layout(
    'Prayer Tower support',
    `<h1>Support</h1>
<div class="notice"><p><strong>If you or someone you love is in crisis</strong>, ${esc(line.reach)} (${esc(line.name)}). If you are in danger, call 911.</p></div>
<h2>Contact us</h2>
${contact}
<p>You can also send feedback from inside the app: <strong>Me → Send feedback</strong>.</p>
<h2>Report or block</h2>
<p>Open a request, comment or message and choose <strong>Report</strong>. Moderators review every report. To stop seeing someone, open their profile and choose <strong>Block</strong>. If we remove something you posted, we tell you which rule it broke, and you can appeal in the app.</p>
<h2>Delete your account</h2>
<p>In the app, go to <strong>Me → Delete my account</strong>, or use the <a href="/account-deletion">account deletion page</a>.</p>
<h2>Policies</h2>
<p><a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of use</a></p>`,
    '/support',
  );
}

export function legalPage(o: SiteOptions, which: 'privacy' | 'terms') {
  const doc = legalDoc(o.legalDir, which === 'privacy' ? 'PRIVACY_POLICY' : 'TERMS_OF_USE');
  const title = which === 'privacy' ? 'Privacy policy' : 'Terms of use';
  if (!doc) return { status: 404, html: layout(title, `<h1>${title}</h1><p>This page isn't published yet.</p>`, `/${which}`) };
  return { status: 200, html: layout(`Prayer Tower ${title.toLowerCase()}`, doc.html, `/${which}`) };
}
