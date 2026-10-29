// Links from Supabase's sign-in emails (password reset, email change). The email
// sends the member to the app with the session in the link
// (https://supabase.com/docs/guides/auth/native-mobile-deep-linking).
import * as Linking from 'expo-linking';

export interface AuthLink {
  accessToken: string;
  refreshToken: string;
  /** 'recovery' for a password reset link. */
  type: string | null;
}

/** Where the emails send the member back to: this app (or the web app) at /account-security. */
export const authRedirectUrl = () => Linking.createURL('/account-security');

/** The session in a link, from its #fragment or ?query, or null when the link carries none. */
export function parseAuthLink(url: string | null | undefined): AuthLink | null {
  if (!url) return null;
  const params = new URLSearchParams();
  const hash = url.indexOf('#');
  const query = url.indexOf('?');
  if (query >= 0) new URLSearchParams(url.slice(query + 1, hash > query ? hash : undefined)).forEach((v, k) => params.set(k, v));
  if (hash >= 0) new URLSearchParams(url.slice(hash + 1)).forEach((v, k) => params.set(k, v));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, type: params.get('type') };
}

/** The error Supabase puts in a link that expired or was already used, if any. */
export function authLinkError(url: string | null | undefined): string | null {
  if (!url) return null;
  const at = url.search(/[?#&]error_description=/);
  if (at < 0) return null;
  const raw = url.slice(at + 1).split('&')[0]!.split('=')[1] ?? '';
  return decodeURIComponent(raw.replace(/\+/g, ' ')) || null;
}
