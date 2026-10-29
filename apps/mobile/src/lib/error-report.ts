// What a member reads when something fails, and the error log behind it
// (docs/PILOT_TOOLS.md). A message the server wrote for members (a 4xx answer)
// is shown as it is. Anything else (a server failure, a form check's wording, a
// bug in the app) shows one plain sentence and goes to Admin → Error log, kept
// only while Admin → Pilot tools has the log on.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { OfflineError } from '@/lib/offline';

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

// The same error reported over and over (a render loop) is sent once a minute at most.
const lastSent = new Map<string, number>();
let current = 'unknown';

/** The screen errors are reported from (the route pattern, never an id). */
export function setErrorScreen(screen: string) {
  current = screen || 'unknown';
}

/** Sends an error to the log. Never throws, never waits. */
export function reportError(e: unknown, screen = current) {
  // Being offline is not a bug.
  if (e instanceof OfflineError) return;
  const err = e instanceof Error ? e : new Error(String(e));
  const key = `${screen}\n${err.message}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - 60_000) return;
  lastSent.set(key, now);
  void api
    .reportError({ message: err.message || 'Unknown error', detail: err.stack?.slice(0, 8000), screen, platform: Platform.OS, appVersion: Constants.expoConfig?.version })
    .catch(() => undefined);
}

/** The words to show a member for a failed action. */
export function errorText(e: unknown): string {
  if (e instanceof OfflineError) return e.message;
  if (e instanceof ApiError && e.status < 500 && e.code !== 'invalid_request' && e.code !== 'error') return e.message;
  // Server failures are already in the log from the server's side.
  if (!(e instanceof ApiError && e.status >= 500)) reportError(e);
  return GENERIC_ERROR;
}
