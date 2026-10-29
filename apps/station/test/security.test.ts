import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { httpListenerApi, signedHeaders } from '../src/listener.js';
import { checkApiUrl } from '../src/secure-url.js';

describe('station security', () => {
  it('needs https for the server, except to this machine or when allowed for a test server', () => {
    expect(checkApiUrl('https://api.example.org', false)).toBe('https://api.example.org');
    expect(checkApiUrl('http://127.0.0.1:3000', false)).toBe('http://127.0.0.1:3000');
    expect(checkApiUrl('http://localhost:3000', false)).toBe('http://localhost:3000');
    expect(() => checkApiUrl('http://api.example.org', false)).toThrow(/https/);
    expect(checkApiUrl('http://api.example.org', true)).toBe('http://api.example.org');
    expect(() => checkApiUrl('api.example.org', false)).toThrow(/not a web address/);
  });

  it('signs listener reports without sending the key, newer each time', async () => {
    const seen: { headers: Record<string, string>; body: string }[] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      seen.push({ headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const api = httpListenerApi('https://api.test', 'ptn_secret', fake, { sign: true });
    await api.heartbeat();
    await api.heard({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18, hashes: ['0'.repeat(32)] });
    const secret = createHash('sha256').update('ptn_secret').digest('hex');
    for (const [i, path] of ['/node/heartbeat', '/node/heard'].entries()) {
      const h = seen[i]!.headers;
      expect(h['x-node-key']).toBeUndefined();
      expect(JSON.stringify(h)).not.toContain('ptn_secret');
      expect(h['x-node-kid']).toBe(secret.slice(0, 16));
      expect(h['x-node-sig']).toBe(createHmac('sha256', secret).update(`${h['x-node-ts']}\nPOST\n${path}\n${seen[i]!.body}`).digest('hex'));
    }
    expect(Number(seen[1]!.headers['x-node-ts'])).toBeGreaterThan(Number(seen[0]!.headers['x-node-ts']));
    expect(signedHeaders('k', 'POST', '/node/heard', '{}', 5)['x-node-ts']).toBe('5');
  });
});
