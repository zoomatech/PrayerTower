// The station and listener send their keys with every request, so the server
// address must be https. Plain http is allowed only to this machine (a local test
// server) or with ALLOW_INSECURE_HTTP=1 (docs/STATION_OPERATOR_GUIDE.md, "Security").
export function checkApiUrl(raw: string, allowInsecure = process.env.ALLOW_INSECURE_HTTP === '1'): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`PRAYER_TOWER_API_URL "${raw}" is not a web address`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && (local || allowInsecure))) return raw;
  throw new Error('PRAYER_TOWER_API_URL must start with https:// (keys would cross the network unencrypted); set ALLOW_INSECURE_HTTP=1 only for a test server');
}
