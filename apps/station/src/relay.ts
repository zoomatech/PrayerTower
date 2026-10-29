// Store-and-forward relay (docs/RADIO_BURST.md, "Store-and-forward relay"):
// a listener node with a transmitter re-sends the bursts it decodes, to reach
// listeners beyond the station's range. Off unless RELAY=on. It re-sends a
// frame only when every check passes:
//   - it came from a station in RELAY_FROM (never just anyone on the channel);
//   - it is not the relay's own transmission (its own call sign, heard back);
//   - it has passed fewer than RELAY_MAX_HOPS relays (default 1, at most 3);
//   - the same batch hasn't been relayed here in the last 10 minutes;
//   - the relay is within its airtime budget (RELAY_MAX_SECONDS_PER_HOUR).
// The frame goes out under the relay's own call sign (its identification),
// with the original station and hop count inside (relay-frame.ts).
import { createHash } from 'node:crypto';
import type { HeardFrame } from './burst/web.js';
import { presetByName } from './burst/presets.js';
import type { BurstTransmitter } from './burst/transmit.js';
import { MAX_HOPS, unwrapRelay, wrapRelay } from './burst/relay-frame.js';

export interface RelayConfig {
  /** The relay's own call sign, sent as each relayed frame's identification. */
  callSign: string;
  /** Stations whose frames it may relay (upper case). */
  from: string[];
  maxHops: number;
  maxSecondsPerHour: number;
  /** Wait after hearing a frame before keying, so the channel is clear. */
  delayMs: number;
}

/** A batch relayed in the last this-long is never relayed again (loop protection). */
export const DEDUPE_MS = 10 * 60_000;

export type RelayResult = { relayed: true; seconds: number } | { relayed: false; reason: 'own' | 'not_allowed' | 'max_hops' | 'duplicate' | 'budget' | 'unreadable' };

export class Relay {
  private seen = new Map<string, number>();
  private airtime: { at: number; seconds: number }[] = [];

  constructor(
    private cfg: RelayConfig,
    private tx: BurstTransmitter,
    private now: () => number = Date.now,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    if (!cfg.from.length) throw new Error('RELAY_FROM must list the station call signs to relay');
    if (cfg.maxHops < 1 || cfg.maxHops > MAX_HOPS) throw new Error(`RELAY_MAX_HOPS must be 1-${MAX_HOPS}`);
  }

  /** Decide on one decoded frame, and re-send it if every check passes. */
  async consider(frame: Pick<HeardFrame, 'callSign' | 'preset' | 'batch' | 'prayers'> & { via?: string }): Promise<RelayResult> {
    const own = this.cfg.callSign.toUpperCase();
    const sender = (frame.via ?? frame.callSign).toUpperCase();
    const wrapped = unwrapRelay(frame.batch);
    const origin = (wrapped?.origin ?? frame.callSign).toUpperCase();
    const hops = wrapped?.hops ?? 0;
    const inner = wrapped?.inner ?? frame.batch;
    if (sender === own || origin === own) return { relayed: false, reason: 'own' };
    if (!this.cfg.from.includes(origin)) return { relayed: false, reason: 'not_allowed' };
    if (hops >= this.cfg.maxHops) return { relayed: false, reason: 'max_hops' };
    // Only frames this node could read: it never re-sends something it can't vouch for.
    if (!frame.prayers) return { relayed: false, reason: 'unreadable' };
    const now = this.now();
    for (const [k, at] of this.seen) if (now - at > DEDUPE_MS) this.seen.delete(k);
    const key = createHash('sha256').update(inner).digest('hex');
    if (this.seen.has(key)) return { relayed: false, reason: 'duplicate' };
    this.airtime = this.airtime.filter((a) => now - a.at < 3_600_000);
    const used = this.airtime.reduce((n, a) => n + a.seconds, 0);
    if (used >= this.cfg.maxSecondsPerHour) return { relayed: false, reason: 'budget' };
    this.seen.set(key, now);
    await this.sleep(this.cfg.delayMs);
    const sent = await this.tx.send([wrapRelay(inner, origin, hops + 1)], presetByName(frame.preset), own);
    this.airtime.push({ at: this.now(), seconds: sent.seconds });
    return { relayed: true, seconds: sent.seconds };
  }
}

/** RELAY_* settings, or null while RELAY is not on. */
export function relayConfig(env: NodeJS.ProcessEnv): RelayConfig | null {
  if (env.RELAY !== 'on') return null;
  const callSign = (env.RELAY_CALL_SIGN ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9/-]{3,10}$/.test(callSign)) throw new Error('RELAY=on needs RELAY_CALL_SIGN: the licensed call sign this relay identifies with');
  const num = (name: string, fallback: number, min: number, max: number) => {
    const n = Number(env[name] ?? fallback);
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number from ${min} to ${max}`);
    return n;
  };
  return {
    callSign,
    from: (env.RELAY_FROM ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean),
    maxHops: num('RELAY_MAX_HOPS', 1, 1, MAX_HOPS),
    maxSecondsPerHour: num('RELAY_MAX_SECONDS_PER_HOUR', 120, 1, 3600),
    delayMs: num('RELAY_DELAY_MS', 1000, 0, 60_000),
  };
}
