// An RTL-SDR dongle as a listener node's receiver (src/sdr.ts): settings, the rtl_fm command,
// and a node that "records" through a stand-in rtl_fm and decodes what it hears.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBurst, planFrames } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { httpListenerApi, RollingDecoder, startRecorder } from '../src/listener.js';
import { parseFrequency, receiverOf, rtlFmCommand, sdrSettings } from '../src/sdr.js';

describe('RTL-SDR listener', () => {
  it('is off unless LISTEN_SOURCE=rtlsdr', () => {
    expect(sdrSettings({})).toBeNull();
    expect(sdrSettings({ LISTEN_SOURCE: 'soundcard' })).toBeNull();
    expect(receiverOf(null)).toEqual({ kind: 'sound-card' });
    expect(() => sdrSettings({ LISTEN_SOURCE: 'airspy' })).toThrow(/soundcard or rtlsdr/);
  });

  it('reads frequencies with or without a unit', () => {
    expect(parseFrequency('146.52M')).toBe(146_520_000);
    expect(parseFrequency('146520000')).toBe(146_520_000);
    expect(parseFrequency('446.00625 MHz')).toBe(446_006_250);
    expect(parseFrequency('14070k')).toBe(14_070_000);
    expect(parseFrequency('')).toBeNull();
    expect(parseFrequency('two meters')).toBeNull();
  });

  it('builds an rtl_fm command that gives the listener 48 kHz audio with no squelch', () => {
    const fm = sdrSettings({ LISTEN_SOURCE: 'rtlsdr', LISTEN_SDR_FREQ: '146.52M' })!;
    expect(fm).toEqual({ freqHz: 146_520_000, mode: 'fm', gain: 'auto', ppm: 0, device: 0, direct: false });
    expect(rtlFmCommand(fm)).toBe('rtl_fm -d 0 -f 146520000 -M fm -s 24000 -r 48000 -l 0 -');
    const hf = sdrSettings({ LISTEN_SOURCE: 'rtlsdr', LISTEN_SDR_FREQ: '14.0705M', LISTEN_SDR_MODE: 'usb', LISTEN_SDR_DIRECT: 'on', LISTEN_SDR_GAIN: '29.7', LISTEN_SDR_PPM: '-3', LISTEN_SDR_DEVICE: '1' })!;
    expect(rtlFmCommand(hf)).toBe('rtl_fm -d 1 -f 14070500 -M usb -s 12000 -r 48000 -l 0 -g 29.7 -p -3 -E direct -');
    expect(receiverOf(hf)).toEqual({ kind: 'rtl-sdr', freqHz: 14_070_500, mode: 'usb' });
  });

  it('refuses settings a dongle cannot use', () => {
    const base = { LISTEN_SOURCE: 'rtlsdr' };
    expect(() => sdrSettings(base)).toThrow(/LISTEN_SDR_FREQ/);
    expect(() => sdrSettings({ ...base, LISTEN_SDR_FREQ: '14.07M' })).toThrow(/direct sampling/);
    expect(() => sdrSettings({ ...base, LISTEN_SDR_FREQ: '146.52M', LISTEN_SDR_MODE: 'am' })).toThrow(/fm or usb/);
    expect(() => sdrSettings({ ...base, LISTEN_SDR_FREQ: '146.52M', LISTEN_SDR_GAIN: 'loud' })).toThrow(/GAIN/);
    expect(() => sdrSettings({ ...base, LISTEN_SDR_FREQ: '146.52M', LISTEN_SDR_PPM: '1.5' })).toThrow(/PPM/);
    expect(() => sdrSettings({ ...base, LISTEN_SDR_FREQ: '146.52M', LISTEN_SDR_DEVICE: '-1' })).toThrow(/DEVICE/);
  });

  it('decodes a burst from a stand-in rtl_fm on PATH, run with the exact command', async () => {
    const prayers = ['Peace for our town.', 'Rain for the farms.'];
    const p = presetByName('fm-standard');
    const audio = buildBurst(planFrames(prayers, p, 20), p, 'N0CALL').audio;
    const dir = mkdtempSync(path.join(tmpdir(), 'rtl-fm-'));
    const pcm = Buffer.alloc((audio.length + 48_000) * 2);
    audio.forEach((v, i) => pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), (24_000 + i) * 2));
    writeFileSync(path.join(dir, 'burst.pcm'), pcm);
    // rtl_fm writes its tuning messages on stderr and the audio on stdout; this one also
    // records the arguments it was given.
    const fake = path.join(dir, 'rtl_fm');
    writeFileSync(
      fake,
      `#!${process.execPath}\nconst fs = require('fs');\nfs.writeFileSync(${JSON.stringify(path.join(dir, 'args.json'))}, JSON.stringify(process.argv.slice(2)));\nprocess.stderr.write('Found 1 device(s)\\n');\nprocess.stdout.write(fs.readFileSync(${JSON.stringify(path.join(dir, 'burst.pcm'))}));\n`,
    );
    chmodSync(fake, 0o755);
    const oldPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${oldPath}`;
    try {
      const s = sdrSettings({ LISTEN_SOURCE: 'rtlsdr', LISTEN_SDR_FREQ: '146.52M' })!;
      const dec = new RollingDecoder();
      const logs: string[] = [];
      const rec = startRecorder(rtlFmCommand(s), dec, (m) => logs.push(m));
      await new Promise((r) => setTimeout(r, 800));
      rec.stop();
      expect(dec.decode().map((f) => [f.callSign, f.prayers])).toEqual([['N0CALL', prayers]]);
      expect(logs.some((l) => l.includes('Found 1 device'))).toBe(true);
      expect(JSON.parse(readFileSync(path.join(dir, 'args.json'), 'utf8'))).toEqual(rtlFmCommand(s).split(' ').slice(1));
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it('tells the server what it listens with in its heartbeat', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      seen.push(String(init?.body));
      return new Response('{"ok":true}', { status: 200 });
    }) as typeof fetch;
    const api = httpListenerApi('https://api.example.org', 'node-key', fetchImpl);
    await api.heartbeat(undefined, undefined, { kind: 'rtl-sdr', freqHz: 146_520_000, mode: 'fm' });
    expect(JSON.parse(seen[0]!)).toEqual({ receiver: { kind: 'rtl-sdr', freqHz: 146_520_000, mode: 'fm' } });
  });
});
