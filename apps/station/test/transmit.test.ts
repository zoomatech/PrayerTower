// The sound-card transmitter's keying with PTT commands (no rigctld): a radio
// must never be left on the air after a failure.
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { planFrames } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { audioTransmitter, run } from '../src/burst/transmit.js';

const preset = presetByName('fm-standard');
const batches = planFrames(['Peace for the Lee family'], preset, 20);

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tx-'));
  const log = path.join(dir, 'log');
  writeFileSync(log, '');
  const lines = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  return { dir, log, lines };
}

describe('audio transmitter with PTT commands', () => {
  it('unkeys when the key command fails, and never plays', async () => {
    const { dir, log, lines } = setup();
    const tx = audioTransmitter({ playCommand: `echo play >> ${log}`, pttOnCommand: `echo on >> ${log}; exit 1`, pttOffCommand: `echo off >> ${log}`, pttDelayMs: 0, dir, txTimeoutMs: 10_000 });
    await expect(tx.send(batches, preset, 'N0CALL')).rejects.toThrow(/exited with 1/);
    expect(lines()).toEqual(['on', 'off']);
  });

  it('tries a failed unkey once more', async () => {
    const { dir, log, lines } = setup();
    const once = path.join(dir, 'failed-once');
    // The first unkey fails (a busy serial port), the second works.
    const off = `if [ -e ${once} ]; then echo off >> ${log}; else touch ${once}; echo off-failed >> ${log}; exit 1; fi`;
    const tx = audioTransmitter({ playCommand: `echo play >> ${log}`, pttOnCommand: `echo on >> ${log}`, pttOffCommand: off, pttDelayMs: 0, dir, txTimeoutMs: 10_000 });
    await tx.send(batches, preset, 'N0CALL');
    expect(lines()).toEqual(['on', 'play', 'off-failed', 'off']);
  });

  it('a command that times out is stopped with everything it started', async () => {
    const { dir } = setup();
    const marker = path.join(dir, 'still-playing');
    // The player runs as a child of the shell, as `aplay` does under a wrapper script.
    await expect(run(`sh -c 'sleep 1; touch ${marker}'`, null, 200)).rejects.toThrow(/timed out/);
    await new Promise((r) => setTimeout(r, 1300));
    expect(existsSync(marker)).toBe(false);
  });
});
