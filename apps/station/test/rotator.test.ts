import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DishFollower, rotctldClient } from '../src/rotator.js';
import { httpApi } from '../src/worker.js';
import { startMockRigctld, type MockRig } from './mock-rigctld.js';

let mock: MockRig;
beforeAll(async () => {
  mock = await startMockRigctld();
});
afterAll(() => mock.close());

describe('dish rotator', () => {
  it('turns the rotator through rotctld and reads its position back', async () => {
    const rot = rotctldClient('127.0.0.1', mock.port);
    await rot.point({ az: 163.04, el: 41.0 });
    expect(mock.commands.at(-1)).toBe('P 163.0 41.0');
    expect(await rot.position()).toEqual({ az: 163, el: 41 });
  });

  it('follows the target once a minute, only when it moved more than the step, and waits at the horizon below it', async () => {
    let t = 0;
    let target: { az: number; el: number } | null = { az: 100, el: 30 };
    const f = new DishFollower(rotctldClient('127.0.0.1', mock.port), async () => target, { stepDeg: 2, everyMs: 60_000 }, () => t);
    expect(await f.tick()).toEqual({ az: 100, el: 30 });
    t += 30_000;
    target = { az: 110, el: 30 };
    expect(await f.tick()).toBeNull(); // not a minute yet
    t += 30_000;
    target = { az: 101, el: 30.5 };
    expect(await f.tick()).toBeNull(); // within the step
    t += 60_000;
    target = { az: 359.5, el: -12 };
    expect(await f.tick()).toEqual({ az: 359.5, el: 0 });
    t += 60_000;
    target = { az: 0.5, el: -11 };
    expect(await f.tick()).toBeNull(); // 1° the short way round past north
    expect(f.statusDetail()).toBe('pointed az=359.5 el=0.0');
  });

  it('reports a rotator that does not answer, and keeps going', async () => {
    const f = new DishFollower(rotctldClient('127.0.0.1', 1, 500), async () => ({ az: 10, el: 10 }), { stepDeg: 2, everyMs: 0 });
    expect(await f.tick()).toBeNull();
    expect(f.statusDetail()).toMatch(/rotctld at 127\.0\.0\.1:1/);
  });

  it('asks Prayer Tower where to point; off or an older server means no target', async () => {
    const reply = (status: number, body?: object) => async () => new Response(body ? JSON.stringify(body) : null, { status });
    expect(await httpApi('https://pt.example', 'k', reply(200, { az: 12.5, el: 40, target: 'moon' }) as typeof fetch).skyTarget!()).toEqual({ az: 12.5, el: 40 });
    expect(await httpApi('https://pt.example', 'k', reply(204) as typeof fetch).skyTarget!()).toBeNull();
    expect(await httpApi('https://pt.example', 'k', reply(404) as typeof fetch).skyTarget!()).toBeNull();
  });
});
