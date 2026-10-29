import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkHealth } from '../src/health.js';
import { keyRig, RigError, rigctldClient, tuneRig } from '../src/rig.js';
import { audioTransmitter } from '../src/burst/transmit.js';
import { presetByName } from '../src/burst/presets.js';
import { planFrames } from '../src/burst/burst.js';
import { startMockRigctld, type MockRig } from './mock-rigctld.js';

let mock: MockRig;
beforeAll(async () => {
  mock = await startMockRigctld();
});
afterAll(() => mock.close());
beforeEach(() => {
  mock.commands.length = 0;
  mock.stuckPtt = false;
  mock.state.ptt = 0;
});

describe('rig control through rigctld', () => {
  it('sets and reads frequency, mode and PTT', async () => {
    const rig = rigctldClient('127.0.0.1', mock.port);
    await tuneRig(rig, { frequencyHz: 14_103_000, mode: 'PKTUSB', passbandHz: 3000 }, () => undefined);
    expect(await rig.frequency()).toBe(14_103_000);
    expect(mock.state).toMatchObject({ mode: 'PKTUSB', passband: 3000 });
    await keyRig(rig, true);
    expect(await rig.ptt()).toBe(true);
    await keyRig(rig, false);
    expect(mock.commands).toEqual(['F 14103000', 'M PKTUSB 3000', 'f', 'T 1', 't', 't', 'T 0', 't']);
  });

  it('leaves the radio alone when nothing is set', async () => {
    await tuneRig(rigctldClient('127.0.0.1', mock.port), { passbandHz: 0 }, () => undefined);
    expect(mock.commands).toEqual([]);
  });

  it('reports a Hamlib error, a radio that ignores PTT and a missing rigctld', async () => {
    const rig = rigctldClient('127.0.0.1', mock.port);
    await expect(rig.setMode('BOGUS', 0)).rejects.toThrow(/Hamlib error -1/);
    mock.stuckPtt = true;
    await expect(keyRig(rig, true)).rejects.toThrow(/PTT did not key/);
    await expect(rigctldClient('127.0.0.1', 1).ptt()).rejects.toBeInstanceOf(RigError);
  });

  it('keys burst audio through rigctld, and stops before playing when PTT fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rig-burst-'));
    const preset = presetByName('fm-standard');
    const batches = planFrames(['Peace for the Lee family'], preset, 20);
    const tx = audioTransmitter({ playCommand: 'true', pttOnCommand: 'false', pttOffCommand: 'false', rig: rigctldClient('127.0.0.1', mock.port), pttDelayMs: 0, dir, txTimeoutMs: 10_000 });
    await tx.send(batches, preset, 'N0CALL');
    expect(mock.commands).toEqual(['T 1', 't', 'T 0', 't']);
    expect(mock.state.ptt).toBe(0);

    mock.commands.length = 0;
    mock.stuckPtt = true;
    const marker = path.join(dir, 'played');
    const bad = audioTransmitter({ playCommand: `touch ${marker}`, pttOnCommand: '', pttOffCommand: '', rig: rigctldClient('127.0.0.1', mock.port), pttDelayMs: 0, dir, txTimeoutMs: 10_000 });
    await expect(bad.send(batches, preset, 'N0CALL')).rejects.toThrow(/PTT did not key/);
    expect(mock.commands).toEqual(['T 1', 't', 'T 0']);
    const { existsSync } = await import('node:fs');
    expect(existsSync(marker)).toBe(false);
  });

  it('health check fails a missing rigctld and a stuck PTT', async () => {
    const ok = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    const base = { apiUrl: 'http://api.test', fldigi: null, heartbeatFile: null, maxAgeSeconds: 120, fetchImpl: ok };
    const good = await checkHealth({ ...base, rig: rigctldClient('127.0.0.1', mock.port) });
    expect(good.find((c) => c.name === 'rig')).toMatchObject({ ok: true, detail: expect.stringMatching(/MHz, receive$/) });
    mock.state.ptt = 1;
    expect((await checkHealth({ ...base, rig: rigctldClient('127.0.0.1', mock.port) })).find((c) => c.name === 'rig')?.ok).toBe(false);
    expect((await checkHealth({ ...base, rig: rigctldClient('127.0.0.1', 1) })).find((c) => c.name === 'rig')?.ok).toBe(false);
  });
});
