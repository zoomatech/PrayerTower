import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkHealth } from '../src/health.js';
import { fldigiClient } from '../src/fldigi.js';
import { startMockFldigi, type MockFldigi } from './mock-fldigi.js';

const ok = (async () => new Response('{}', { status: 200 })) as typeof fetch;
let mock: MockFldigi;
let beat: string;

beforeAll(async () => {
  mock = await startMockFldigi();
  beat = path.join(mkdtempSync(path.join(tmpdir(), 'station-health-')), 'heartbeat');
  writeFileSync(beat, '');
});
afterAll(() => mock.close());

describe('checkHealth', () => {
  it('passes when the worker beat recently, the API answers and fldigi is in receive', async () => {
    const checks = await checkHealth({ apiUrl: 'http://api.test/', fldigi: fldigiClient(mock.url), heartbeatFile: beat, maxAgeSeconds: 120, fetchImpl: ok });
    expect(checks.map((c) => [c.name, c.ok])).toEqual([['worker', true], ['prayer tower api', true], ['fldigi', true]]);
  });

  it('fails a stale or missing heartbeat', async () => {
    const old = new Date(Date.now() - 600_000);
    utimesSync(beat, old, old);
    const [stale] = await checkHealth({ apiUrl: 'http://api.test', fldigi: fldigiClient(mock.url), heartbeatFile: beat, maxAgeSeconds: 120, fetchImpl: ok });
    expect(stale).toMatchObject({ name: 'worker', ok: false });
    const [missing] = await checkHealth({ apiUrl: 'http://api.test', fldigi: fldigiClient(mock.url), heartbeatFile: beat + '-none', maxAgeSeconds: 120, fetchImpl: ok });
    expect(missing).toMatchObject({ name: 'worker', ok: false });
  });

  it('fails when the API errors and when fldigi is not answering', async () => {
    const down = (async () => new Response('', { status: 503 })) as typeof fetch;
    const checks = await checkHealth({ apiUrl: 'http://api.test', fldigi: fldigiClient('http://127.0.0.1:1/RPC2'), heartbeatFile: null, maxAgeSeconds: 120, fetchImpl: down });
    expect(checks).toEqual([
      { name: 'prayer tower api', ok: false, detail: 'HTTP 503' },
      expect.objectContaining({ name: 'fldigi', ok: false }),
    ]);
  });
});
