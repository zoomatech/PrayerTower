// Jitsi as a Service (8x8's hosted Jitsi, the paid option in docs/LIVE_VIDEO.md).
// Each member who opens a room gets their own short-lived token, signed with the
// API key from the JaaS console; the host is the room's moderator. Fields follow
// https://developer.8x8.com/jaas/docs/api-keys-jwt.
import { importPKCS8, SignJWT } from 'jose';

export interface JaasKeys {
  /** The AppID, `vpaas-magic-cookie-…` (JaaS console → API keys). */
  appId: string;
  /** The API key's id, as the console shows it (`vpaas-magic-cookie-…/…`). */
  keyId: string;
  /** The API key's private key (PEM, PKCS #8). */
  privateKey: string;
}

export const JAAS_HOST = 'https://8x8.vc';

export const jaasRoomUrl = (keys: JaasKeys, name: string) => `${JAAS_HOST}/${keys.appId}/${name}`;
export const isJaasRoom = (keys: JaasKeys | null, url: string) => !!keys && url.startsWith(`${JAAS_HOST}/${keys.appId}/`);

/** The room's address with this member's token (good for 3 hours). */
export async function jaasJoinUrl(keys: JaasKeys, roomUrl: string, user: { id: string; name: string; moderator: boolean }) {
  const room = roomUrl.slice(`${JAAS_HOST}/${keys.appId}/`.length);
  const key = await importPKCS8(keys.privateKey.replace(/\\n/g, '\n'), 'RS256');
  const jwt = await new SignJWT({
    room,
    context: {
      user: { id: user.id, name: user.name, moderator: user.moderator },
      // Nothing is recorded or streamed (docs/LIVE_VIDEO.md).
      features: { livestreaming: false, recording: false, transcription: false },
    },
  })
    .setProtectedHeader({ alg: 'RS256', kid: keys.keyId, typ: 'JWT' })
    .setAudience('jitsi')
    .setIssuer('chat')
    .setSubject(keys.appId)
    .setNotBefore(Math.floor(Date.now() / 1000) - 10)
    .setExpirationTime('3h')
    .sign(key);
  return `${roomUrl}?jwt=${jwt}`;
}
