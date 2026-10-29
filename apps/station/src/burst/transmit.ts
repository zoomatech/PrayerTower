// Ways to put a burst on the air (BURST_MODE):
//   audio    play the burst WAV through the sound card wired to the radio,
//            keying with PTT commands (e.g. hamlib rigctl) or the radio's VOX
//   fldigi   send each frame as one line of text in a fast fldigi mode
//   simulate write the WAV to a folder, decode it back and log what a
//            receiver would hear; nothing is keyed
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Fldigi } from '../fldigi.js';
import { keyRig, type Rig } from '../rig.js';
import { withId, type StationId } from '../station-id.js';
import { hfChannel, HF_CHANNELS } from './hf-channel.js';
import { buildBurst, listen, type Burst } from './burst.js';
import { reportFrom, writeReport } from './auto.js';
import { encodeTextFrame } from './text-frame.js';
import { toWav } from './wav.js';
import type { BurstPreset } from './presets.js';

export interface SentBurst {
  frames: number;
  seconds: number;
  bytes: number;
  /** Prayers a receiver decoded back from the burst (simulate mode), or null when not checked. */
  decoded: number | null;
}

export interface BurstTransmitter {
  readonly mode: 'audio' | 'fldigi' | 'simulate';
  /** Send the batches in one key-up; resolves when the radio is back in receive. */
  send(batches: Uint8Array[], preset: BurstPreset, callSign: string): Promise<SentBurst>;
  /** Unkey now (after an error). */
  stop(): Promise<void>;
  /** Play raw audio in one key-up (the setup wizard's test tone, setup-test.ts). Absent: this mode can't. */
  sendAudio?(audio: Float32Array, sampleRate: number): Promise<void>;
}

/** Run a shell command; {wav} is replaced by the quoted file path. Rejects on a non-zero exit or timeout. */
export function run(command: string, wav: string | null, timeoutMs: number): Promise<void> {
  const cmd = wav ? command.replaceAll('{wav}', `'${wav.replaceAll("'", "'\\''")}'`) : command;
  return new Promise((resolve, reject) => {
    // Its own process group, so a timeout stops the player the shell started too, not just the shell.
    const child = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-500)));
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      reject(new Error(`"${command}" timed out`));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`"${command}" exited with ${code}: ${err.trim()}`));
    });
  });
}

function writeWav(dir: string, burst: Pick<Burst, 'audio' | 'sampleRate'>, prefix = 'burst'): string {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`);
  writeFileSync(file, toWav(burst.audio, burst.sampleRate));
  return file;
}
export interface AudioOptions {
  /** Plays a WAV to the radio's sound card, e.g. "aplay -q -D plughw:1,0 {wav}". */
  playCommand: string;
  /** Keys and unkeys the transmitter, e.g. "rigctl -m 2 T 1" / "rigctl -m 2 T 0". Empty for VOX. */
  pttOnCommand: string;
  pttOffCommand: string;
  /** RIG_CONTROL=rigctld: key through rigctld and read PTT back, instead of the commands. */
  rig?: Rig;
  /** Wait after keying before audio starts, for the radio to reach full power. */
  pttDelayMs: number;
  /** Where burst WAVs are written (kept as the station's log of what was sent). */
  dir: string;
  txTimeoutMs: number;
  /** STATION_ID=cw: the call sign in Morse code at the end of the key-up when one is due (station-id.ts). */
  stationId?: StationId;
}

export function audioTransmitter(o: AudioOptions): BurstTransmitter {
  const unkeyOnce = async () => {
    if (o.rig) await keyRig(o.rig, false);
    else if (o.pttOffCommand) await run(o.pttOffCommand, null, 10_000);
  };
  // A radio left keyed is the worst failure, so a failed unkey is tried once more.
  const unkey = () => unkeyOnce().catch(async () => {
    await new Promise((r) => setTimeout(r, 500));
    await unkeyOnce();
  });
  /** Key, play the WAV, unkey (always). */
  const keyAndPlay = async (wav: string, seconds: number) => {
    if (o.rig) await keyRig(o.rig, true).catch(async (err) => {
      // A half-keyed radio must not stay on the air.
      await o.rig!.setPtt(false).catch(() => undefined);
      throw err;
    });
    else if (o.pttOnCommand) await run(o.pttOnCommand, null, 10_000).catch(async (err) => {
      // The key command may have keyed the radio before it failed or timed out.
      await unkey().catch(() => undefined);
      throw err;
    });
    try {
      if (o.pttDelayMs) await new Promise((r) => setTimeout(r, o.pttDelayMs));
      await run(o.playCommand, wav, Math.min(o.txTimeoutMs, seconds * 1000 + 30_000));
    } finally {
      await unkey();
    }
  };
  return {
    mode: 'audio',
    async send(batches, preset, callSign) {
      const built = buildBurst(batches, preset, callSign);
      const burst = { ...built, audio: withId(built.audio, o.stationId, built.sampleRate) };
      burst.seconds = burst.audio.length / burst.sampleRate;
      await keyAndPlay(writeWav(o.dir, burst), burst.seconds);
      return { frames: burst.frames, seconds: burst.seconds, bytes: burst.bytes, decoded: null };
    },
    stop: unkey,
    async sendAudio(audio, sampleRate) {
      await keyAndPlay(writeWav(o.dir, { audio, sampleRate }, 'tone'), audio.length / sampleRate);
    },
  };
}

/**
 * Simulate mode: write the burst to a WAV file and decode it back. With
 * `snrDb`, white noise at that SNR (in 2.5 kHz) is added first; with
 * `reportFile`, the simulated receiver writes its channel report there, as a
 * real receiver would for BURST_PRESET=auto. With `hf`, the audio goes through
 * a simulated HF SSB path instead (hf-channel.ts: CCIR 520 fading, a
 * receiver 20 Hz off, at snrDb or 15 dB) and the receiver searches 50 Hz.
 */
export function simulateTransmitter(
  dir: string,
  log: (m: string) => void,
  opts: { snrDb?: number; reportFile?: string; hf?: keyof typeof HF_CHANNELS; stationId?: StationId } = {},
): BurstTransmitter {
  let seed = 1;
  return {
    mode: 'simulate',
    async send(batches, preset, callSign) {
      const built = buildBurst(batches, preset, callSign);
      const burst = { ...built, audio: withId(built.audio, opts.stationId, built.sampleRate) };
      burst.seconds = burst.audio.length / burst.sampleRate;
      if (burst.audio.length > built.audio.length) log(`[simulate] station ID (CW) after the burst: de ${callSign}`);
      const wav = writeWav(dir, burst);
      const heard = opts.hf
        ? listen(hfChannel(burst.audio, { ...HF_CHANNELS[opts.hf], snrDb: opts.snrDb ?? 15, offsetHz: 20, lowHz: 300, highHz: 2700, seed: seed++ }), 50)
        : listen(opts.snrDb === undefined ? burst.audio : addNoise(burst.audio, opts.snrDb));
      const report = reportFrom(heard);
      if (opts.reportFile && report) await writeReport(opts.reportFile, report);
      const count = heard.reduce((n, h) => n + h.prayers.length, 0);
      log(`[simulate] ${wav}: ${burst.frames} frame(s), ${burst.bytes} bytes, ${burst.seconds.toFixed(2)} s on air (${preset.name}); a receiver decodes ${count} prayer(s)`);
      for (const h of heard) for (const p of h.prayers) log(`[simulate]   de ${h.callSign}: ${p}`);
      return { frames: burst.frames, seconds: burst.seconds, bytes: burst.bytes, decoded: count };
    },
    async stop() {},
    async sendAudio(audio, sampleRate) {
      log(`[simulate] test tone written to ${writeWav(dir, { audio, sampleRate }, 'tone')} (${(audio.length / sampleRate).toFixed(1)} s); nothing keyed`);
    },
  };
}

/** White noise at snrDb relative to the audio's power, measured in 2.5 kHz of the 24 kHz band (seeded, so runs repeat). */
function addNoise(audio: Float32Array, snrDb: number): Float32Array {
  let e = 0;
  let n = 0;
  for (const v of audio) {
    if (v !== 0) {
      e += v * v;
      n++;
    }
  }
  const sigma = (Math.sqrt(e / Math.max(1, n)) / 10 ** (snrDb / 20)) * Math.sqrt(24_000 / 2_500);
  let x = 12345;
  const rand = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  return Float32Array.from(audio, (v) => v + sigma * Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand()));
}

export function fldigiTransmitter(fldigi: Fldigi, txTimeoutMs: number, stationId?: StationId): BurstTransmitter {
  return {
    mode: 'fldigi',
    async send(batches, _preset, callSign) {
      const started = Date.now();
      // One key-up: every frame on its own line (and "de CALL" when an ID is due), then ^r returns to receive.
      const id = stationId?.takeText();
      await fldigi.transmit([...batches.map((b) => encodeTextFrame(b, callSign)), ...(id ? [id] : [])].join('\n'), txTimeoutMs);
      return { frames: batches.length, seconds: (Date.now() - started) / 1000, bytes: batches.reduce((n, b) => n + b.length, 0), decoded: null };
    },
    stop: () => fldigi.rxOnly(),
  };
}
