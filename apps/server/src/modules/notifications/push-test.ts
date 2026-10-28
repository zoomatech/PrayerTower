// The push test (`npm run push-test`): checks Firebase's google-services.json
// against the app's package names, then sends one test notice to a member's
// devices through Expo and reads back the receipts, which name a broken FCM or
// APNs setup (InvalidCredentials, MismatchSenderId). docs/archive/ANDROID_PUSH.md.
// https://docs.expo.dev/push-notifications/sending-notifications/
export const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export const APP_PACKAGES = ['com.zoomatech.prayertower', 'com.zoomatech.prayertower.staging'];

/** What's wrong with a google-services.json, or [] when it fits the app. */
export function checkGoogleServices(json: unknown, packages = APP_PACKAGES): string[] {
  const j = json as { project_info?: { project_id?: string; project_number?: string }; client?: { client_info?: { android_client_info?: { package_name?: string } } }[] };
  if (!j?.project_info?.project_id || !j.project_info.project_number) return ['not a google-services.json (no project_info); download it again from Firebase → Project settings → Your apps'];
  const found = (j.client ?? []).map((c) => c.client_info?.android_client_info?.package_name).filter(Boolean) as string[];
  const problems: string[] = [];
  if (!found.includes(packages[0]!)) problems.push(`no Android app with package ${packages[0]} (found: ${found.join(', ') || 'none'}); add it in Firebase and download the file again`);
  for (const p of packages.slice(1)) if (!found.includes(p)) problems.push(`note: no Android app for ${p}, so staging builds get no push (optional)`);
  return problems;
}

interface Ticket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface PushTestResult {
  token: string;
  ok: boolean;
  /** Expo's error code (DeviceNotRegistered, InvalidCredentials, MismatchSenderId…) or message. */
  error?: string;
  /** The receipt never arrived in time; it may still be delivered. */
  pending?: boolean;
}

const HINTS: Record<string, string> = {
  InvalidCredentials: 'the FCM V1 service account key (Android) or APNs key (iOS) is missing or wrong in EAS: run `eas credentials`',
  MismatchSenderId: 'google-services.json and the uploaded FCM key are from different Firebase projects',
  DeviceNotRegistered: 'the app was uninstalled or the token is old; open the app on the phone again',
};
export const hint = (error: string | undefined) => (error ? HINTS[error] : undefined);

export async function sendTestPush(input: {
  tokens: string[];
  title: string;
  body: string;
  accessToken?: string;
  fetchImpl?: typeof fetch;
  /** Polls for receipts this many times, `delayMs` apart. */
  tries?: number;
  delayMs?: number;
}): Promise<PushTestResult[]> {
  const f = input.fetchImpl ?? fetch;
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    ...(input.accessToken ? { authorization: `Bearer ${input.accessToken}` } : {}),
  };
  const res = await f(EXPO_SEND_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(input.tokens.map((to) => ({ to, title: input.title, body: input.body, data: { test: true } }))),
  });
  if (!res.ok) throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
  const tickets = ((await res.json()) as { data: Ticket[] }).data;
  const results: PushTestResult[] = input.tokens.map((token, i) => {
    const t = tickets[i];
    return t?.status === 'ok' ? { token, ok: true, pending: true } : { token, ok: false, error: t?.details?.error ?? t?.message ?? 'no ticket' };
  });
  const ids = new Map(tickets.flatMap((t, i) => (t.status === 'ok' && t.id ? [[t.id, i] as const] : [])));
  for (let n = 0; n < (input.tries ?? 6) && [...ids.keys()].length; n++) {
    await new Promise((r) => setTimeout(r, input.delayMs ?? 5000));
    const r = await f(EXPO_RECEIPTS_URL, { method: 'POST', headers, body: JSON.stringify({ ids: [...ids.keys()] }) });
    if (!r.ok) continue;
    const receipts = ((await r.json()) as { data: Record<string, Ticket> }).data ?? {};
    for (const [id, receipt] of Object.entries(receipts)) {
      const i = ids.get(id);
      if (i === undefined) continue;
      results[i] = receipt.status === 'ok' ? { token: input.tokens[i]!, ok: true } : { token: input.tokens[i]!, ok: false, error: receipt.details?.error ?? receipt.message };
      ids.delete(id);
    }
  }
  return results;
}
