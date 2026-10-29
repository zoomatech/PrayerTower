import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { autoChooser, parseCandidates } from '../src/burst/auto.js';
import { buildBurst, planFrames } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { fingerprint } from '../src/burst/sha256.js';
import { defaultRecordCommand, httpListenerApi, listenOnce, RollingDecoder, s16le, type ListenerApi } from '../src/listener.js';

function recorder() {
  const calls: { kind: string; body: Record<string, unknown> }[] = [];
  const api: ListenerApi = {
    channelReport: async (r) => void calls.push({ kind: 'report', body: r }),
    heard: async (r) => void calls.push({ kind: 'heard', body: r }),
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
    };
    dec.push(new Float32Array([...silence(0.3), ...burst.audio, ...silence(0.3)]));
    expect(await listenOnce(dec, failing, { searchHz: 0, receipts: false }, (m) => logs.push(m))).toHaveLength(1);
    expect(logs.some((l) => l.includes('channel report failed (500)'))).toBe(true);
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

  it('posts reports with the node key, and receipts without it; a switched-off server is not an error', async () => {
    const seen: { url: string; key: string | null; body: string }[] = [];
    let status = 200;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, key: (init.headers as Record<string, string>)['x-node-key'] ?? null, body: String(init.body) });
      return new Response('{}', { status });
    }) as unknown as typeof fetch;
    const api = httpListenerApi('https://api.test/', 'ptn_abc', fetchImpl);
    await api.channelReport({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18 });
    await api.heard({ callSign: 'N0CALL', preset: 'fm-fast', snrDb: 18, hashes: ['0'.repeat(32)] });
    expect(seen.map((s) => [s.url, s.key])).toEqual([
      ['https://api.test/node/channel-report', 'ptn_abc'],
      ['https://api.test/listen/heard', null],
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
