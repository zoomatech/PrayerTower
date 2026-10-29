// The invite email an admin sends from Admin → Invite codes, in English or
// Spanish. It carries the code, where to get the app, and (when the web app's
// address is set) a link that opens sign-up with the code filled in.
import { z } from 'zod';
import { memberLang } from '../../language.js';
import type { Mail } from '../digest/mailer.js';

export type InviteLang = 'en' | 'es';

export const EmailInvite = z.object({
  email: z.email().max(320),
  /** The invitee's language; defaults to the admin's own app language. */
  language: z.enum(['en', 'es']).optional(),
  message: z.string().trim().max(500).optional(),
});


export interface InviteLinks {
  /** The web app (PWA) address; its /sign-in?invite=CODE opens sign-up with the code. */
  webAppUrl: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  /** The TestFlight public link (https://testflight.apple.com/join/…) while the iPhone app is in its pilot test. */
  testFlightUrl?: string | null;
  /** Open Circle's own TestFlight link, for invites to a secular community. */
  openCircleTestFlightUrl?: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TEXT = {
  en: {
    subject: 'You are invited to Prayer Tower',
    hello: (from: string) => `${from} invited you to Prayer Tower, where real people pray for each other by name.`,
    code: 'Your invite code',
    steps: 'Get the app, tap "New here? Create an account", and enter the code.',
    open: 'Or open this link to sign up with the code filled in:',
    ios: 'iPhone and iPad (App Store)',
    testFlight: 'iPhone and iPad (test version): install Apple\'s free TestFlight app from the App Store, then open',
    android: 'Android (Google Play)',
    web: 'Any browser',
    note: (n: string) => `Note from ${n}:`,
    footer: 'Prayer Tower is invite-only during the pilot. If you did not expect this email, you can ignore it.',
  },
  es: {
    subject: 'Te invitamos a Prayer Tower',
    hello: (from: string) => `${from} te invitó a Prayer Tower, donde personas reales oran unas por otras por nombre.`,
    code: 'Tu código de invitación',
    steps: 'Descarga la aplicación, toca "¿Eres nuevo? Crea una cuenta" y escribe el código.',
    open: 'O abre este enlace para registrarte con el código ya escrito:',
    ios: 'iPhone y iPad (App Store)',
    testFlight: 'iPhone y iPad (versión de prueba): instala la aplicación gratuita TestFlight de Apple desde el App Store y luego abre',
    android: 'Android (Google Play)',
    web: 'Cualquier navegador',
    note: (n: string) => `Nota de ${n}:`,
    footer: 'Durante el piloto, Prayer Tower es solo por invitación. Si no esperabas este correo, puedes ignorarlo.',
  },
} satisfies Record<InviteLang, unknown>;

/** An invite to a secular community (Open Circle): its name, and no religious words. */
const neutral = (name: string): (typeof TEXT)['en'] => ({
  ...TEXT.en,
  subject: `You are invited to ${name}`,
  hello: (from: string) => `${from} invited you to ${name}, an ad-free place where real people cheer each other on.`,
  footer: `${name} is invite-only during the pilot. If you did not expect this email, you can ignore it.`,
});

export function renderInviteEmail(input: {
  to: string;
  code: string;
  lang: InviteLang;
  from: string;
  message?: string | null;
  links: InviteLinks;
  community?: { name: string; secular: boolean } | null;
}): Mail {
  const lang = input.community?.secular ? 'en' : memberLang(input.lang);
  const t = input.community?.secular ? neutral(input.community.name) : TEXT[lang];
  const signUp = input.links.webAppUrl ? `${input.links.webAppUrl.replace(/\/$/, '')}/sign-in?invite=${encodeURIComponent(input.code)}` : null;
  const testFlight = input.community?.secular ? input.links.openCircleTestFlightUrl : input.links.testFlightUrl;
  const stores = [
    testFlight ? { label: t.testFlight, url: testFlight } : null,
    input.links.appStoreUrl ? { label: t.ios, url: input.links.appStoreUrl } : null,
    input.links.playStoreUrl ? { label: t.android, url: input.links.playStoreUrl } : null,
    input.links.webAppUrl ? { label: t.web, url: input.links.webAppUrl } : null,
  ].filter((s): s is { label: string; url: string } => !!s);
  const text = [
    t.hello(input.from),
    '',
    `${t.code}: ${input.code}`,
    '',
    t.steps,
    ...stores.map((s) => `- ${s.label}: ${s.url}`),
    ...(signUp ? ['', t.open, signUp] : []),
    ...(input.message ? ['', t.note(input.from), input.message] : []),
    '',
    '—',
    t.footer,
  ].join('\n');
  const html = `<!doctype html><html lang="${lang}"><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#2a2438;max-width:560px">
<p>${esc(t.hello(input.from))}</p>
<p>${esc(t.code)}:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:ui-monospace,monospace">${esc(input.code)}</p>
<p>${esc(t.steps)}</p>
${stores.length ? `<ul>${stores.map((s) => `<li><a href="${esc(s.url)}">${esc(s.label)}</a></li>`).join('')}</ul>` : ''}
${signUp ? `<p>${esc(t.open)}<br><a href="${esc(signUp)}">${esc(signUp)}</a></p>` : ''}
${input.message ? `<p><strong>${esc(t.note(input.from))}</strong><br>${esc(input.message)}</p>` : ''}
<hr><p style="font-size:13px;color:#6b6478">${esc(t.footer)}</p></body></html>`;
  return { to: input.to, subject: t.subject, text, html, ...(input.community?.secular && { secular: true }) };
}
