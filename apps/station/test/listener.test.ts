import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoChooser, parseCandidates } from '../src/burst/auto.js';
import { buildBurst, planFrames } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { fingerprint } from '../src/burst/sha256.js';
import { defaultRecordCommand, httpListenerApi, listenOnce, Outbox, ReportError, RollingDecoder, s16le, startRecorder, type ListenerApi } from '../src/listener.js';

function recorder() {
  const calls: { kind: string; body: Record<string, unknown> }[] = [];
  const api: ListenerApi = {
    channelReport: async (r) => void calls.push({ kind: 'report', body: r }),
    heard: async (r) => void calls.push({ kind: 'heard', body: r }),
    heartbeat: async () => void calls.push({ kind: 'heartbeat', body: {} }),
  };
  return { api, calls };
}

const prayers = ['Healing for Ana after surgery', 'Peace in the Lee home'];
const preset = presetByName('fm-standard');
const burst = buildBurst(planFrames(prayers, preset, 20), preset, 'N0CALL');
const silence = (s: number) => new Float32Array(Math.round(s * 48_000));

describe('listener node', () => {
  it('decodes a burst arriving in chunks, reports it once, with fingerprints for receipts', async () => {
    const dec = new RollingDecoder();
    const { api, calls } = recorder();
    const dir = mkdtempSync(path.join(tmpdir(), 'listener-'));
    const cfg = { searchHz: 0, receipts: true, reportFile: path.join(dir, 'channel.json') };
    const audio = new Float32Array([...silence(0.5), ...burst.audio, ...silence(0.5)]);
    // Half the burst first: nothing yet.
    dec.push(audio.subarray(0, Math.floor(audio.length / 2)));
    expect(await listenOnce(dec, api, cfg, () => undefined)).toEqual([]);
    dec.push(audio.subarray(Math.floor(audio.length / 2)));
    const frames = await listenOnce(dec, api, cfg, () => undefined);
    expect(frames).toHaveLength(1);
    expect(calls.map((c) => c.kind)).toEqual(['report', 'heard']);
    expect(calls[0]!.body).toMatchObject({ callSign: 'N0CALL', preset: 'fm-standard' });
    expect(calls[0]!.body.snrDb).toBeGreaterThan(20);
    expect(calls[1]!.body.hashes).toEqual(prayers.map(fingerprint));
    expect(JSON.stringify(calls)).not.toContain('Ana');
    expect(JSON.parse(readFileSync(cfg.reportFile, 'utf8'))).toMatchObject({ callSign: 'N0CALL', preset: 'fm-standard' });
    // More silence: the same frame is not reported again.
    dec.push(silence(2));
    expect(await listenOnce(dec, api, cfg, () => undefined)).toEqual([]);
    expect(calls).toHaveLength(2);
  });

  it('skips receipts when they are off, and keeps going when reporting fails', async () => {
    const dec = new RollingDecoder();
    const logs: string[] = [];
    const failing: ListenerApi = {
      channelReport: async () => {
        throw new Error('channel report failed (500)');
      },
      heard: async () => {
        throw new Error('should not be called');
      },
      heartbeat: async () => {},
    };
    dec.push(new Float32Array([...silence(0.3), ...burst.audio, ...silence(0.3)]));
    expect(await listenOnce(dec, failing, { searchHz: 0, receipts: false }, (m) => logs.push(m))).toHaveLength(1);
    expect(logs.some((l) => l.includes('channel report failed (500)'))).toBe(true);
  });

  it('keeps receipts that fail during an outage and sends them when the server is back, oldest first', async () => {
    const dec = new RollingDecoder();
    const { api, calls } = recorder();
    let down = true;
    const flaky: ListenerApi = {
      channelReport: async (r) => {
        if (down) throw new TypeError('fetch failed');
        return api.channelReport(r);
      },
      heard: async (r) => {
        if (down) throw new ReportError('receipt failed (503)', 503);
        return api.heard(r);
      },
      heartbeat: async () => {},
    };
    const outbox = new Outbox();
    const cfg = { searchHz: 0, receipts: true, outbox };
    dec.push(new Float32Array([...silence(0.3), ...burst.audio, ...silence(0.3)]));
    expect(await listenOnce(dec, flaky, cfg, () => undefined)).toHaveLength(1);
    expect(outbox.size).toBe(2);
    expect(calls).toEqual([]);
    // Back up: the next decode round sends what was kept, before anything new.
    down = false;
    const logs: string[] = [];
    dec.push(silence(1));
    await listenOnce(dec, flaky, cfg, (m) => logs.push(m));
    expect(outbox.size).toBe(0);
    expect(calls.map((c) => c.kind)).toEqual(['report', 'heard']);
    expect(calls[1]!.body.hashes).toEqual(prayers.map(fingerprint));
    expect(logs).toContain('[listener] sent 2 kept report(s)');
  });

  it('never keeps a report the server refused, and drops kept ones after 23 hours or past 500', async () => {
    const outbox = new Outbox({ max: 3 });
    const log = () => undefined;
    const failingWith = (status: number): ListenerApi => ({
      channelReport: async () => {},
      heard: async () => {
        throw new ReportError(`receipt failed (${status})`, status);
      },
      heartbeat: async () => {},
    });
    const heard = (n: number) => ({ kind: 'heard' as const, body: { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 20, hashes: [`h${n}`] } });
    await outbox.send(failingWith(400), heard(0), log);
    expect(outbox.size).toBe(0);
    for (let i = 0; i < 5; i++) await outbox.send(failingWith(502), heard(i), log, 0);
    expect(outbox.size).toBe(3);
    await outbox.flush(failingWith(502), log, 23 * 3_600_000);
    expect(outbox.size).toBe(0);
  });

  it('keeps reports in a file, so they survive a restart or a power cut', async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'outbox-')), 'outbox.json');
    const down: ListenerApi = {
      channelReport: async () => {},
      heard: async () => {
        throw new TypeError('fetch failed');
      },
      heartbeat: async () => {},
    };
    const body = { callSign: 'N0CALL', preset: 'fm-standard', snrDb: 20, hashes: ['abc'] };
    await new Outbox({ file }).send(down, { kind: 'heard', body }, () => undefined);
    // The node restarts with the server back up.
    const { api, calls } = recorder();
    const after = new Outbox({ file });
    expect(after.size).toBe(1);
    await after.flush(api, () => undefined);
    expect(calls).toEqual([{ kind: 'heard', body }]);
    expect(new Outbox({ file }).size).toBe(0);
    // A damaged file starts empty rather than stopping the node.
    writeFileSync(file, '{not json');
    expect(new Outbox({ file }).size).toBe(0);
  });

  it('runs the recorder without a shell, decodes what it records, and restarts a recorder that fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'recorder-'));
    const pcm = Buffer.alloc((burst.audio.length + 48_000) * 2);
    burst.audio.forEach((v, i) => pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), (24_000 + i) * 2));
    writeFileSync(path.join(dir, 'burst.pcm'), pcm);
    const script = path.join(dir, 'rec.cjs');
    writeFileSync(script, "process.stdout.write(require('fs').readFileSync(process.argv[2]))");
    const dec = new RollingDecoder();
    const logs: string[] = [];
    const rec = startRecorder(`${process.execPath} ${script} ${path.join(dir, 'burst.pcm')}`, dec, (m) => logs.push(m));
    await new Promise((r) => setTimeout(r, 800));
    rec.stop();
    const frames = dec.decode();
    expect(frames.map((f) => f.prayers)).toEqual([prayers]);
    expect(logs.some((l) => l.includes('restarting in 5 s'))).toBe(true);

    const missing: string[] = [];
    const bad = startRecorder('no-such-recorder-here -q', new RollingDecoder(), (m) => missing.push(m));
    await new Promise((r) => setTimeout(r, 200));
    bad.stop();
    expect(missing.filter((l) => l.includes('restarting'))).toHaveLength(1);
    expect(missing[0]).toMatch(/ENOENT/);
  });

  it('turns 16-bit PCM into samples, carrying an odd byte to the next chunk', () => {
    const carry = { rest: Buffer.alloc(0) };
    const pcm = Buffer.alloc(6);
    pcm.writeInt16LE(16384, 0);
    pcm.writeInt16LE(-32768, 2);
    pcm.writeInt16LE(32767, 4);
    expect(Array.from(s16le(pcm.subarray(0, 3), carry))).toEqual([0.5]);
    expect(Array.from(s16le(pcm.subarray(3), carry))).toEqual([-1, 32767 / 32768]);
    expect(defaultRecordCommand('linux')).toMatch(/^arecord /);
    expect(defaultRecordCommand('darwin')).toMatch(/^rec /);
  });

  it('posts reports, fingerprints and heartbeats with the node key; a switched-off server is not an error', async () => {
    const seen: { url: string; key: string | null; body: string }[] = [];
    let status = 200;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, key: (init.headers as Record<string, string>)['x-node-key'] ?? null, body: String(init.body) });
      return new Response('{}', { status });
    }) as unknown as typeof fetch;
    const api = httpListenerApi('https://api.test/', 'ptn_abc', fetchImpl);
    await api.channelReport({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18 });
    await api.heard({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18, hashes: ['0'.repeat(32)] });
    await api.heartbeat();
    expect(seen.map((s) => [s.url, s.key])).toEqual([
      ['https://api.test/node/channel-report', 'ptn_abc'],
      ['https://api.test/node/heard', 'ptn_abc'],
      ['https://api.test/node/heartbeat', 'ptn_abc'],
    ]);
    status = 404;
    await api.channelReport({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18 });
    status = 401;
    await expect(api.channelReport({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18 })).rejects.toThrow(/401/);
  });

  it('auto preset reads the server report with the station key, and falls back on a 204', async () => {
    const asked: (string | undefined)[] = [];
    let body = JSON.stringify({ snrDb: 30, at: new Date().toISOString(), callSign: 'N0CALL', preset: 'fm-standard' });
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      asked.push((init.headers as Record<string, string>)['x-station-key']);
      return new Response(body || null, { status: body ? 200 : 204 });
    }) as unknown as typeof fetch;
    const choose = autoChooser(
      { report: 'https://api.test/station/channel?callSign=N0CALL', candidates: parseCandidates('fm-robust-fec,fm-standard,fm-fast'), marginDb: 3, maxAgeMs: 60_000, headers: { 'x-station-key': 'k' } },
      () => undefined,
      Date.now,
      fetchImpl,
    );
    expect((await choose()).name).toBe('fm-fast');
    body = '';
    expect((await choose()).name).toBe('fm-robust-fec');
    expect(asked).toEqual(['k', 'k']);
  });
});

describe('station on a Mac', () => {
  it('finds output devices in system_profiler JSON, and fails with none', async () => {
    const { macAudioCheck } = await import('../src/status.js');
    const listing = { SPAudioDataType: [{ _items: [{ _name: 'MacBook Pro Microphone', coreaudio_device_input: 1 }, { _name: 'USB Audio Device', coreaudio_device_output: 2, coreaudio_device_input: 1 }] }] };
    expect(await macAudioCheck(async () => JSON.stringify(listing))).toEqual({ name: 'audio', ok: true, detail: 'USB Audio Device' });
    expect((await macAudioCheck(async () => JSON.stringify({ SPAudioDataType: [{ _items: [] }] }))).ok).toBe(false);
    expect((await macAudioCheck(async () => 'not json')).ok).toBe(false);
    // A listing without output markers still names what is there.
    expect(await macAudioCheck(async () => JSON.stringify({ SPAudioDataType: [{ _items: [{ _name: 'Speakers' }] }] }))).toMatchObject({ ok: true, detail: 'Speakers' });
  });
});
