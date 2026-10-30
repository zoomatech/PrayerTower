// The station's start-up checks (src/main.ts): a mistyped setting must stop it at once with a
// message that names the setting, before it talks to the server or keys the radio.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const TSX = path.join(here, '../../../node_modules/.bin/tsx');
const MAIN = path.join(here, '../src/main.ts');
const BASE = { PRAYER_TOWER_API_URL: 'https://prayer.example', STATION_API_KEY: 'k', CALL_SIGN: 'KD9XYZ' };

/** Runs the station with only these settings and returns how it stopped. */
function start(env: Record<string, string | undefined>) {
  const clean = Object.fromEntries(Object.entries({ ...BASE, ...env }).filter(([, v]) => v !== undefined)) as Record<string, string>;
  const r = spawnSync(TSX, [MAIN], { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...clean }, encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('station start-up checks', () => {
  it.each([
    ['a missing call sign', { CALL_SIGN: undefined }, 'Set CALL_SIGN'],
    ['a call sign that is not one', { CALL_SIGN: 'HELLO' }, 'does not look like a call sign'],
    ['a missing server address', { PRAYER_TOWER_API_URL: undefined }, 'Set PRAYER_TOWER_API_URL'],
    ['a plain http server address', { PRAYER_TOWER_API_URL: 'http://prayer.example' }, 'must start with https://'],
    ['a missing station key', { STATION_API_KEY: undefined }, 'Set STATION_API_KEY'],
    ['a poll interval that is not a number', { POLL_SECONDS: 'ten' }, 'POLL_SECONDS must be a whole number'],
    ['a transmit timeout out of range', { TX_TIMEOUT_SECONDS: '5' }, 'TX_TIMEOUT_SECONDS must be a whole number'],
    ['an unknown burst mode', { BURST_MODE: 'loud' }, 'BURST_MODE must be'],
    ['an unknown SSTV send mode', { BURST_MODE: 'sstv', SSTV_SEND: 'maybe' }, 'SSTV_SEND must be audio or simulate'],
    ['an unknown rig control', { RIG_CONTROL: 'serial' }, 'RIG_CONTROL must be off or rigctld'],
    ['an unknown rotator', { ROTATOR: 'yes' }, 'ROTATOR must be off or rotctld'],
    ['an unknown station ID mode', { STATION_ID: 'voice' }, 'STATION_ID must be off or cw'],
    ['a band plan with no rig control', { BAND_PLAN: 'server' }, 'needs RIG_CONTROL=rigctld'],
    ['a simulated SNR that is not a number', { BURST_MODE: 'simulate', BURST_SIM_SNR_DB: 'loud' }, 'BURST_SIM_SNR_DB must be a number'],
    ['an unknown simulated HF path', { BURST_MODE: 'simulate', BURST_SIM_HF: 'stormy' }, 'BURST_SIM_HF must be one of'],
    ['a bad digipeater path', { PACKET_PATH: 'WIDE 1' }, 'PACKET_PATH must be digipeater aliases'],
    ['a packet call sign AX.25 cannot carry', { BURST_MODE: 'packet', CALL_SIGN: 'KD9XYZ/P' }, 'needs a call sign AX.25 can carry'],
  ])('stops on %s', (_name, env, message) => {
    const r = start(env);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain(message);
  }, 40_000);
});
