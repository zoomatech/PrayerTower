// The push test script's checks (no network: Expo is faked).
import { describe, expect, it } from 'vitest';
import { checkGoogleServices, EXPO_RECEIPTS_URL, EXPO_SEND_URL, hint, sendTestPush } from '../src/modules/notifications/push-test.js';

const gs = (...packages: string[]) => ({
  project_info: { project_id: 'prayer-tower', project_number: '123' },
  client: packages.map((package_name) => ({ client_info: { android_client_info: { package_name } } })),
});

describe('push test', () => {
  it('checks google-services.json against the app’s package names', () => {
    expect(checkGoogleServices(gs('com.zoomatech.prayertower', 'com.zoomatech.prayertower.staging'))).toEqual([]);
    expect(checkGoogleServices(gs('com.zoomatech.prayertower'))).toEqual([expect.stringMatching(/^note: .*staging/)]);
    expect(checkGoogleServices(gs('com.other.app'))[0]).toMatch(/no Android app with package com\.zoomatech\.prayertower \(found: com\.other\.app\)/);
    expect(checkGoogleServices({ type: 'service_account' })[0]).toMatch(/not a google-services\.json/);
  });

  it('sends through Expo and reports each receipt, with a hint for broken credentials', async () => {
    const calls: { url: string; body: unknown; auth?: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization });
      const data =
        url === EXPO_SEND_URL
          ? [{ status: 'ok', id: 'r1' }, { status: 'ok', id: 'r2' }, { status: 'error', message: 'not a token', details: { error: 'DeviceNotRegistered' } }]
          : { r1: { status: 'ok' }, r2: { status: 'error', message: 'bad key', details: { error: 'InvalidCredentials' } } };
      return new Response(JSON.stringify({ data }), { status: 200 });
    }) as typeof fetch;
    const results = await sendTestPush({ tokens: ['A', 'B', 'C'], title: 'T', body: 'B', accessToken: 'tok', fetchImpl: fakeFetch, delayMs: 0 });
    expect(results).toEqual([
      { token: 'A', ok: true },
      { token: 'B', ok: false, error: 'InvalidCredentials' },
      { token: 'C', ok: false, error: 'DeviceNotRegistered' },
    ]);
    expect(calls.map((c) => c.url)).toEqual([EXPO_SEND_URL, EXPO_RECEIPTS_URL]);
    expect(calls[1]!.body).toEqual({ ids: ['r1', 'r2'] });
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
    expect(hint('InvalidCredentials')).toMatch(/eas credentials/);
  });
});
