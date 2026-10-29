import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bandFollower } from '../src/band.js';
import { rigctldClient } from '../src/rig.js';
import type { BandPick } from '../src/worker.js';
import { startMockRigctld, type MockRig } from './mock-rigctld.js';

let mock: MockRig;
beforeAll(async () => {
  mock = await startMockRigctld();
});
afterAll(() => mock.close());

describe('band plan on the station', () => {
  it('retunes only when the server band changes, and uses the preset the plan names', async () => {
    const picks: (BandPick | null)[] = [
      { band: { label: '20 m', freqHz: 14_103_000, mode: 'usb', preset: 'hf-standard' }, reason: 'hf', mufMhz: 18.2 },
      { band: { label: '20 m', freqHz: 14_103_000, mode: 'usb', preset: 'hf-standard' }, reason: 'hf', mufMhz: 17.9 },
      { band: { label: '40 m', freqHz: 7_103_000, mode: 'usb' }, reason: 'hf', mufMhz: 9.1 },
      null,
    ];
    const lines: string[] = [];
    const next = bandFollower({ band: async () => picks.shift() ?? null }, rigctldClient('127.0.0.1', mock.port), { usb: 'PKTUSB', fm: 'FM' }, (m) => lines.push(m));
    expect(await next()).toMatchObject({ preset: { name: 'hf-standard' }, frequencyHz: 14_103_000 });
    expect(await next()).toMatchObject({ frequencyHz: 14_103_000 });
    expect(await next()).toEqual({ preset: undefined, frequencyHz: 7_103_000 });
    expect(await next()).toBeNull();
    expect(mock.commands).toEqual(['F 14103000', 'M PKTUSB 0', 'F 7103000', 'M PKTUSB 0']);
    expect(lines).toEqual(['[band] 20 m: 14.1030 MHz USB (estimated MUF 18.2 MHz)', '[band] 40 m: 7.1030 MHz USB (estimated MUF 9.1 MHz)']);
  });
});
