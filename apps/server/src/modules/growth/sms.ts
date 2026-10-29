// Text messages for the prayer chain, through Twilio's Messages API
// (POST /2010-04-01/Accounts/{AccountSid}/Messages.json; https://www.twilio.com/docs/messaging/api/message-resource).
// Unset keys = no texts are sent.

export interface SmsKeys {
  accountSid: string;
  authToken: string;
  /** A Twilio number (+1…) or a Messaging Service SID (MG…). */
  from: string;
}

/** Sends one text. `optedOut` is true when the number replied STOP (Twilio error 21610). */
export type SmsSend = (to: string, body: string) => Promise<{ ok: boolean; optedOut: boolean }>;

export function createSms(keys: SmsKeys, fetchImpl: typeof fetch = fetch): SmsSend {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(keys.accountSid)}/Messages.json`;
  const auth = `Basic ${Buffer.from(`${keys.accountSid}:${keys.authToken}`).toString('base64')}`;
  return async (to, body) => {
    const form = new URLSearchParams({ To: to, Body: body.slice(0, 1600) });
    form.set(keys.from.startsWith('MG') ? 'MessagingServiceSid' : 'From', keys.from);
    const res = await fetchImpl(url, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    if (res.ok) return { ok: true, optedOut: false };
    const err = (await res.json().catch(() => ({}))) as { code?: number };
    if (err.code === 21610) return { ok: false, optedOut: true };
    // Anything else (bad number, outage) is not retried: one text is never worth a duplicate.
    return { ok: false, optedOut: false };
  };
}
