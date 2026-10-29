import { describe, expect, it } from 'vitest';
import { buildBurst, listen } from '../src/burst/burst.js';
import { decodeBatch, encodeBatch } from '../src/burst/codec.js';
import { presetByName } from '../src/burst/presets.js';
import { unwrapRelay, wrapRelay } from '../src/burst/relay-frame.js';
import type { BurstTransmitter } from '../src/burst/transmit.js';
import { decodeAudio } from '../src/burst/web.js';
import { listenOnce, RollingDecoder, type ListenerApi } from '../src/listener.js';
import { Relay, relayConfig, DEDUPE_MS } from '../src/relay.js';

const p = presetByName('fm-standard');
const prayers = ['Pray for the valley clinic.', 'Pray for the bus drivers.'];
const station = (call = 'N0CALL', batch = encodeBatch(prayers)) => decodeAudio(buildBurst([batch], p, call).audio, 48_000)[0]!;

/** A transmitter that "sends" by decoding what it would have put on the air, like a second listener down the valley. */
function fakeTx() {
  const sent: { batches: Uint8Array[]; callSign: string }[] = [];
  const tx: BurstTransmitter = {
    mode: 'simulate',
    async send(batches, preset, callSign) {
      sent.push({ batches, callSign });
      return { frames: batches.length, seconds: buildBurst(batches, preset, callSign).seconds, bytes: 0, decoded: null };
    },
    async stop() {},
  };
  return { tx, sent };
}
const cfg = { callSign: 'K1RLY', from: ['N0CALL'], maxHops: 1, maxSecondsPerHour: 120, delayMs: 0 };

describe('store-and-forward relay', () => {
  it('wraps a batch with its origin and hop count, which every receiver unwraps', () => {
    const inner = encodeBatch(prayers);
    const w = wrapRelay(inner, 'n0call', 1);
    expect(unwrapRelay(w)).toEqual({ origin: 'N0CALL', hops: 1, inner });
    expect(decodeBatch(w)).toEqual(prayers);
    expect(() => wrapRelay(w, 'N0CALL', 2)).toThrow(/original batch/);
    // Heard over the air: the station is the origin; the relay is "via".
    const [f] = decodeAudio(buildBurst([w], p, 'K1RLY').audio, 48_000);
    expect(f).toMatchObject({ callSign: 'N0CALL', via: 'K1RLY', hops: 1, prayers });
    expect(listen(buildBurst([w], p, 'K1RLY').audio)[0]).toMatchObject({ callSign: 'N0CALL', via: 'K1RLY', prayers });
  });

  it('re-sends an allowed station once, under its own call sign, and refuses loops, strangers and repeats', async () => {
    const { tx, sent } = fakeTx();
    let now = 1_000_000;
    const relay = new Relay(cfg, tx, () => now, async () => {});
    const heard = station();
    expect(await relay.consider(heard)).toMatchObject({ relayed: true });
    expect(sent[0]!.callSign).toBe('K1RLY');
    expect(unwrapRelay(sent[0]!.batches[0]!)).toMatchObject({ origin: 'N0CALL', hops: 1 });
    // The same batch again (another listener path, or its own echo of the original): once only.
    expect(await relay.consider(heard)).toEqual({ relayed: false, reason: 'duplicate' });
    // Its own transmission heard back.
    const echo = decodeAudio(buildBurst(sent[0]!.batches, p, 'K1RLY').audio, 48_000)[0]!;
    expect(await relay.consider(echo)).toEqual({ relayed: false, reason: 'own' });
    // Another relay's copy: one hop is the limit by default.
    const other = decodeAudio(buildBurst([wrapRelay(encodeBatch(['Pray for the night nurses.']), 'N0CALL', 1)], p, 'W2RLY').audio, 48_000)[0]!;
    expect(await relay.consider(other)).toEqual({ relayed: false, reason: 'max_hops' });
    // A station nobody listed.
    expect(await relay.consider(station('W9XYZ', encodeBatch(['Pray for me.'])))).toEqual({ relayed: false, reason: 'not_allowed' });
    // A batch it can't read is never re-sent.
    expect(await relay.consider({ ...station('N0CALL', Uint8Array.from([9, 1, 2])), prayers: null })).toEqual({ relayed: false, reason: 'unreadable' });
    // After the dedupe window the same batch may go again.
    now += DEDUPE_MS + 1;
    expect(await relay.consider(heard)).toMatchObject({ relayed: true });
    expect(sent).toHaveLength(2);
  });

  it('with two hops allowed, passes a relayed frame on once more but never a third time', async () => {
    const { tx, sent } = fakeTx();
    const relay = new Relay({ ...cfg, maxHops: 2 }, tx, Date.now, async () => {});
    const once = decodeAudio(buildBurst([wrapRelay(encodeBatch(prayers), 'N0CALL', 1)], p, 'W2RLY').audio, 48_000)[0]!;
    expect(await relay.consider(once)).toMatchObject({ relayed: true });
    expect(unwrapRelay(sent[0]!.batches[0]!)).toMatchObject({ origin: 'N0CALL', hops: 2 });
    const twice = decodeAudio(buildBurst([wrapRelay(encodeBatch(['Pray for the ferry crew.']), 'N0CALL', 2)], p, 'W3RLY').audio, 48_000)[0]!;
    expect(await relay.consider(twice)).toEqual({ relayed: false, reason: 'max_hops' });
  });

  it('stops for the hour once its airtime budget is spent', async () => {
    const { tx } = fakeTx();
    const relay = new Relay({ ...cfg, maxSecondsPerHour: 0.3 }, tx, Date.now, async () => {});
    expect(await relay.consider(station('N0CALL', encodeBatch(['Pray for A.'])))).toMatchObject({ relayed: true });
    expect(await relay.consider(station('N0CALL', encodeBatch(['Pray for B.'])))).toEqual({ relayed: false, reason: 'budget' });
    await relay.consider(station('W9XYZ'));
    // What its heartbeat tells the operator console.
    expect(relay.status()).toMatchObject({ callSign: 'K1RLY', relayedLastHour: 1, budgetSeconds: 0.3, skipped: { budget: 1, not_allowed: 1 } });
    expect(relay.status().secondsLastHour).toBeGreaterThan(0);
  });

  it('is off unless RELAY=on, and needs a call sign and a list of stations', () => {
    expect(relayConfig({})).toBeNull();
    expect(() => relayConfig({ RELAY: 'on' })).toThrow(/RELAY_CALL_SIGN/);
    expect(relayConfig({ RELAY: 'on', RELAY_CALL_SIGN: 'k1rly', RELAY_FROM: 'n0call, w9xyz' })).toMatchObject({ callSign: 'K1RLY', from: ['N0CALL', 'W9XYZ'], maxHops: 1 });
    expect(() => new Relay({ ...cfg, from: [] }, fakeTx().tx)).toThrow(/RELAY_FROM/);
    expect(() => relayConfig({ RELAY: 'on', RELAY_CALL_SIGN: 'K1RLY', RELAY_MAX_HOPS: '4' })).toThrow(/RELAY_MAX_HOPS/);
  });

  it('a listener node reports a relayed prayer as heard from the original station, without a channel report', async () => {
    const reports: { kind: string; callSign: string }[] = [];
    const api: ListenerApi = {
      heartbeat: async () => {},
      channelReport: async (r) => void reports.push({ kind: 'channel', callSign: r.callSign }),
      heard: async (r) => void reports.push({ kind: 'heard', callSign: r.callSign }),
    } as ListenerApi;
    const dec = new RollingDecoder();
    dec.push(buildBurst([wrapRelay(encodeBatch(prayers), 'N0CALL', 1)], p, 'K1RLY').audio);
    const frames = await listenOnce(dec, api, { searchHz: 0, receipts: true }, () => {});
    expect(frames[0]).toMatchObject({ callSign: 'N0CALL', via: 'K1RLY' });
    expect(reports).toEqual([{ kind: 'heard', callSign: 'N0CALL' }]);
  });
});
