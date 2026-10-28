// The public website served by the API host: a landing page, the privacy policy
// and terms (the URLs both app stores ask for), and support/contact (Apple 1.2).
// The account-deletion page lives in ../deletion-page.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crisisLine } from '@prayer-tower/shared';
import { marked } from 'marked';
import { languages } from '../../language.js';

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

export type Lang = 'en' | 'es';

/** Where a page lives in each language: English at the root, Spanish under /es. */
export const pathFor = (lang: Lang, page: string) => (lang === 'es' ? (page === '/' ? '/es' : `/es${page}`) : page);

/** The crisis line in Spanish. The US line answers in Spanish by phone, text and chat (samhsa.gov, checked 2026-10-28). */
const CRISIS_ES: Record<string, { name: string; reach: string }> = {
  'the 988 Suicide & Crisis Lifeline': { name: 'la Línea 988 de Prevención del Suicidio y Crisis, con atención en español', reach: 'llama o envía un mensaje de texto al 988 en cualquier momento' },
  '9-8-8: Suicide Crisis Helpline': { name: '9-8-8: Línea de Ayuda en Crisis de Suicidio', reach: 'llama o envía un mensaje de texto al 9-8-8 en cualquier momento' },
  Samaritans: { name: 'Samaritans', reach: 'llama gratis a Samaritans al 116 123 en cualquier momento' },
};

const T = {
  en: {
    nav: ['Home', 'Support', 'Privacy', 'Terms', 'Delete account'],
    navLabel: 'Site',
    other: { href: 'es', label: 'Español', lang: 'es' },
    footer: 'Prayer Tower is not an emergency service. If you are in danger, call 911.',
    appStore: 'Get it on the App Store',
    playStore: 'Get it on Google Play',
    pilot: 'Prayer Tower is in a small, invite-only pilot. Thank you for your patience while we learn together.',
    landingTitle: 'Prayer Tower: pray for one another',
    landing: `<h1>Pray for one another.</h1>
<p class="lede">Prayer Tower is a quiet, caring place to ask for prayer and to pray for others.</p>
{stores}
<div class="card"><h2>Ask for prayer</h2><p>Share what's on your heart in a few words, with your name or anonymously. You'll see when people are praying for you, and you can thank them.</p></div>
<div class="card"><h2>Pray for others</h2><p>Read real requests from real people and tap "Praying Now" when you pray. Promise to keep praying, and Prayer Tower will gently remind you.</p></div>
<div class="card"><h2>Pray together, safely</h2><p>Groups, prayer meetings and prayer partners, with clear community rules, reporting, blocking and real moderators. There are no ads, and we never sell your information.</p></div>`,
    supportTitle: 'Prayer Tower support',
    email: (a: string) => `<p>Email ${a}. We usually answer within two days.</p>`,
    noEmail: '<p>In the app, go to <strong>Me → Send feedback</strong>. The pilot team reads every message.</p>',
    crisis: (reach: string, name: string) => `<p><strong>If you or someone you love is in crisis</strong>, ${reach} (${name}). If you are in danger, call 911.</p>`,
    support: `<h1>Support</h1>
{crisis}
<h2>Contact us</h2>
{contact}
<p>You can also send feedback from inside the app: <strong>Me → Send feedback</strong>.</p>
<h2>Report or block</h2>
<p>Open a request, comment or message and choose <strong>Report</strong>. Moderators review every report. To stop seeing someone, open their profile and choose <strong>Block</strong>. If we remove something you posted, we tell you which rule it broke, and you can appeal in the app.</p>
<h2>Delete your account</h2>
<p>In the app, go to <strong>Me → Delete my account</strong>, or use the <a href="{deletion}">account deletion page</a>.</p>
<h2>Policies</h2>
<p><a href="{privacy}">Privacy policy</a> · <a href="{terms}">Terms of use</a></p>`,
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    pageTitle: (t: string) => `Prayer Tower ${t.toLowerCase()}`,
    notYet: "This page isn't published yet.",
    englishOnly: '',
  },
  es: {
    nav: ['Inicio', 'Ayuda', 'Privacidad', 'Términos', 'Eliminar cuenta'],
    navLabel: 'Sitio',
    other: { href: 'en', label: 'English', lang: 'en' },
    footer: 'Prayer Tower no es un servicio de emergencias. Si estás en peligro, llama al 911.',
    appStore: 'Descárgala en el App Store',
    playStore: 'Disponible en Google Play',
    pilot: 'Prayer Tower está en un piloto pequeño, solo con invitación. Gracias por tu paciencia mientras aprendemos juntos.',
    landingTitle: 'Prayer Tower: oren unos por otros',
    landing: `<h1>Oren unos por otros.</h1>
<p class="lede">Prayer Tower es un lugar tranquilo y lleno de cariño para pedir oración y orar por los demás.</p>
{stores}
<div class="card"><h2>Pide oración</h2><p>Comparte en pocas palabras lo que llevas en el corazón, con tu nombre o de forma anónima. Verás cuando otras personas oran por ti, y podrás darles las gracias.</p></div>
<div class="card"><h2>Ora por otros</h2><p>Lee peticiones reales de personas reales y toca "Orando ahora" cuando ores. Promete seguir orando, y Prayer Tower te lo recordará con delicadeza.</p></div>
<div class="card"><h2>Oren juntos, con seguridad</h2><p>Grupos, reuniones de oración y compañeros de oración, con reglas claras para la comunidad, reportes, bloqueos y moderadores reales. No hay anuncios y nunca vendemos tu información.</p></div>`,
    supportTitle: 'Ayuda de Prayer Tower',
    email: (a: string) => `<p>Escríbenos a ${a}. Solemos responder en un plazo de dos días.</p>`,
    noEmail: '<p>En la aplicación, ve a <strong>Yo → Enviar comentarios</strong>. El equipo del piloto lee cada mensaje.</p>',
    crisis: (reach: string, name: string) => `<p><strong>Si tú o alguien a quien quieres está en crisis</strong>, ${reach} (${name}). Si estás en peligro, llama al 911.</p>`,
    support: `<h1>Ayuda</h1>
{crisis}
<h2>Contáctanos</h2>
{contact}
<p>También puedes enviar comentarios desde la aplicación: <strong>Yo → Enviar comentarios</strong>.</p>
<h2>Reportar o bloquear</h2>
<p>Abre una petición, un comentario o un mensaje y elige <strong>Reportar</strong>. Los moderadores revisan cada reporte. Para dejar de ver a alguien, abre su perfil y elige <strong>Bloquear</strong>. Si quitamos algo que publicaste, te decimos qué regla rompió y puedes apelar en la aplicación.</p>
<h2>Eliminar tu cuenta</h2>
<p>En la aplicación, ve a <strong>Yo → Eliminar mi cuenta</strong>, o usa la <a href="{deletion}">página para eliminar la cuenta</a>.</p>
<h2>Políticas</h2>
<p><a href="{privacy}">Política de privacidad</a> · <a href="{terms}">Términos de uso</a></p>`,
    privacy: 'Política de privacidad',
    terms: 'Términos de uso',
    pageTitle: (t: string) => `${t} de Prayer Tower`,
    notYet: 'Esta página aún no está publicada.',
    englishOnly: '<p class="notice" lang="es">Esta página todavía no está traducida. La versión vigente está en inglés.</p>',
  },
} satisfies Record<Lang, unknown>;

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);

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
 * reviewer notes for counsel are never published. Spanish uses NAME.es.md or
 * NAME_DRAFT.es.md, but a Spanish draft never stands in for a reviewed English
 * file: then the English one is shown (english: true).
 */
export function legalDoc(
  dir: string | null,
  name: 'PRIVACY_POLICY' | 'TERMS_OF_USE',
  lang: Lang = 'en',
): { html: string; draft: boolean; english?: boolean } | null {
  if (!dir) return null;
  const read = (file: string) => {
    const full = path.join(dir, file);
    if (!existsSync(full)) return null;
    const md = readFileSync(full, 'utf8').split(/\n---\n+## (Reviewer notes|Notas para la revisión)/)[0]!;
    return marked.parse(md, { async: false });
  };
  const final = read(`${name}.md`);
  if (lang === 'es') {
    const es = read(`${name}.es.md`);
    if (es) return { html: es, draft: false };
    const esDraft = final ? null : read(`${name}_DRAFT.es.md`);
    if (esDraft) return { html: esDraft, draft: true };
  }
  if (final) return { html: final, draft: false, ...(lang === 'es' ? { english: true } : {}) };
  const draft = read(`${name}_DRAFT.md`);
  return draft ? { html: draft, draft: true, ...(lang === 'es' ? { english: true } : {}) } : null;
}

const PAGES = ['/', '/support', '/privacy', '/terms', '/account-deletion'] as const;

/** `current` is the page's English path ('' for pages outside the menu). */
export function layout(title: string, body: string, current: string, lang: Lang = 'en') {
  const t = T[lang];
  const nav = PAGES.map((p, i) => {
    const href = pathFor(lang, p);
    return `<a href="${href}"${p === current ? ' aria-current="page"' : ''}>${t.nav[i]}</a>`;
  }).join('');
  const other = t.other.lang as Lang;
  const switcher = current && languages.spanish ? `<a href="${pathFor(other, current)}" hreflang="${other}" lang="${other}">${t.other.label}</a>` : '';
  const alternates = current && languages.spanish
    ? (['en', 'es'] as const).map((l) => `<link rel="alternate" hreflang="${l}" href="${pathFor(l, current)}">`).join('')
    : '';
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${alternates}
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
<header><a class="brand" href="${pathFor(lang, '/')}">Prayer Tower</a><nav aria-label="${t.navLabel}">${nav}${switcher}</nav></header>
<main>${body}</main>
<footer>${t.footer}</footer>
</body></html>`;
}

function storeButtons(o: SiteOptions, lang: Lang) {
  return [
    o.appStoreUrl ? `<a class="button" href="${esc(o.appStoreUrl)}">${T[lang].appStore}</a>` : '',
    o.playStoreUrl ? `<a class="button" href="${esc(o.playStoreUrl)}">${T[lang].playStore}</a>` : '',
  ].join('');
}

export function landing(o: SiteOptions, lang: Lang = 'en') {
  const t = T[lang];
  const stores = storeButtons(o, lang) || `<p class="notice">${t.pilot}</p>`;
  return layout(t.landingTitle, fill(t.landing, { stores }), '/', lang);
}

/**
 * What someone without the app sees when they open a shared request or comment
 * link. It never shows the request itself (that needs a signed-in member), only
 * a button that opens the app and the store links.
 */
export function sharedPost(o: SiteOptions, postId: string, commentId: string | null) {
  const deep = `prayertower://post/${encodeURIComponent(postId)}${commentId ? `?comment=${encodeURIComponent(commentId)}` : ''}`;
  const stores = storeButtons(o, 'en');
  return layout(
    commentId ? 'A comment on Prayer Tower' : 'A prayer request on Prayer Tower',
    `<h1>${commentId ? 'Someone shared a comment with you.' : 'Someone asked you to pray.'}</h1>
<p class="lede">Open it in the Prayer Tower app to read it and pray.</p>
<p><a class="button" href="${esc(deep)}">Open in Prayer Tower</a></p>
${stores ? `<p>Don't have the app yet?</p>${stores}` : '<p class="notice">Prayer Tower is in a small, invite-only pilot. If you have been invited, install the app from your invitation, then open this link again.</p>'}`,
    '',
  );
}

export function support(o: SiteOptions, lang: Lang = 'en') {
  const t = T[lang];
  const en = crisisLine(o.crisisCountry);
  const line = lang === 'es' ? (CRISIS_ES[en.name] ?? en) : en;
  const contact = o.supportEmail ? t.email(`<a href="mailto:${esc(o.supportEmail)}">${esc(o.supportEmail)}</a>`) : t.noEmail;
  return layout(
    t.supportTitle,
    fill(t.support, {
      crisis: `<div class="notice">${t.crisis(esc(line.reach), esc(line.name))}</div>`,
      contact,
      deletion: pathFor(lang, '/account-deletion'),
      privacy: pathFor(lang, '/privacy'),
      terms: pathFor(lang, '/terms'),
    }),
    '/support',
    lang,
  );
}

export function legalPage(o: SiteOptions, which: 'privacy' | 'terms', lang: Lang = 'en') {
  const t = T[lang];
  const doc = legalDoc(o.legalDir, which === 'privacy' ? 'PRIVACY_POLICY' : 'TERMS_OF_USE', lang);
  const title = t[which];
  if (!doc) return { status: 404, html: layout(title, `<h1>${title}</h1><p>${t.notYet}</p>`, `/${which}`, lang) };
  const body = doc.english ? `${t.englishOnly}<div lang="en">${doc.html}</div>` : doc.html;
  return { status: 200, html: layout(t.pageTitle(title), body, `/${which}`, lang) };
}
