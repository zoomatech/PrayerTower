// Links people share outside the app. With an https site they open the app when
// it is installed (universal links / App Links) and a "get the app" page when it
// isn't; without one (local development) they fall back to the app's own scheme.
import * as Linking from 'expo-linking';
import { env } from './env';

const base = env.linkUrl || (env.apiUrl.startsWith('https://') ? env.apiUrl : '');

export function shareLink(path: `/${string}`, query: Record<string, string> = {}): string {
  if (!base) return Linking.createURL(path, { queryParams: query });
  const qs = new URLSearchParams(query).toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}
