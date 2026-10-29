// Apple Push Notification service, token-based (a .p8 key), for Live Activity updates.
// Apple's docs: "Sending notification requests to APNs" and "Starting and updating
// Live Activities with ActivityKit push notifications".
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { connect, type ClientHttp2Session } from 'node:http2';

export interface ApnsKey {
  keyId: string;
  teamId: string;
  /** The .p8 file's contents. */
  privateKey: string;
  production: boolean;
}

/** Sends one push; resolves to Apple's HTTP status and reason (if any). */
export type ApnsSend = (deviceToken: string, topic: string, payload: object, headers: Record<string, string>) => Promise<{ status: number; reason: string | null }>;

const b64 = (x: Buffer | string) => Buffer.from(x).toString('base64url');

/** The provider token: an ES256 JWT, reused for up to 50 minutes (Apple refuses one older than an hour). */
export function providerToken(key: ApnsKey, pk: KeyObject, now = Date.now()) {
  const header = b64(JSON.stringify({ alg: 'ES256', kid: key.keyId }));
  const claims = b64(JSON.stringify({ iss: key.teamId, iat: Math.floor(now / 1000) }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: pk, dsaEncoding: 'ieee-p1363' });
  return `${header}.${claims}.${b64(signature)}`;
}

export function createApns(key: ApnsKey): ApnsSend {
  const pk = createPrivateKey(key.privateKey.replace(/\\n/g, '\n'));
  const host = key.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
  let jwt: { token: string; at: number } | null = null;
  let session: ClientHttp2Session | null = null;
  const open = () => {
    if (!session || session.closed || session.destroyed) {
      session = connect(host);
      session.on('error', () => (session = null));
      session.unref();
    }
    return session;
  };
  return (deviceToken, topic, payload, headers) => {
    if (!jwt || Date.now() - jwt.at > 50 * 60_000) jwt = { token: providerToken(key, pk), at: Date.now() };
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = open().request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${jwt!.token}`,
        'apns-topic': topic,
        'content-type': 'application/json',
        ...headers,
      });
      let status = 0;
      let data = '';
      req.setTimeout(10_000, () => req.close());
      req.on('response', (h) => (status = Number(h[':status'])));
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => {
        let reason: string | null = null;
        try {
          reason = data ? ((JSON.parse(data) as { reason?: string }).reason ?? null) : null;
        } catch {
          reason = null;
        }
        resolve({ status, reason });
      });
      req.on('error', reject);
      req.end(body);
    });
  };
}
