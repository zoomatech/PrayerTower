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
import { buildBurst, listen, type Burst } from './burst.js';
import { encodeTextFrame } from './text-frame.js';
import { toWav } from './wav.js';
import type { BurstPreset } from './presets.js';

export interface BurstTransmitter {
  /** Send the batches in one key-up; resolves when the radio is back in receive. */
  send(batches: Uint8Array[], preset: BurstPreset, callSign: string): Promise<{ frames: number; seconds: number }>;
  /** Unkey now (after an error). */
  stop(): Promise<void>;
}

/** Run a shell command; {wav} is replaced by the quoted file path. Rejects on a non-zero exit or timeout. */
export function run(command: string, wav: string | null, timeoutMs: number): Promise<void> {
  const cmd = wav ? command.replaceAll('{wav}', `'${wav.replaceAll("'", "'\\''")}'`) : command;
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-500)));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
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

function writeWav(dir: string, burst: Burst): string {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `burst-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`);
  writeFileSync(file, toWav(burst.audio, burst.sampleRate));
  return file;
}
export interface AudioOptions {
  /** Plays a WAV to the radio's sound card, e.g. "aplay -q -D plughw:1,0 {wav}". */
  playCommand: string;
  /** Keys and unkeys the transmitter, e.g. "rigctl -m 2 T 1" / "rigctl -m 2 T 0". Empty for VOX. */
  pttOnCommand: string;
  pttOffCommand: string;
  /** Wait after keying before audio starts, for the radio to reach full power. */
  pttDelayMs: number;
  /** Where burst WAVs are written (kept as the station's log of what was sent). */
  dir: string;
  txTimeoutMs: number;
}

export function audioTransmitter(o: AudioOptions): BurstTransmitter {
  const unkey = async () => {
    if (o.pttOffCommand) await run(o.pttOffCommand, null, 10_000);
  };
  return {
    async send(batches, preset, callSign) {
      const burst = buildBurst(batches, preset, callSign);
      const wav = writeWav(o.dir, burst);
      if (o.pttOnCommand) await run(o.pttOnCommand, null, 10_000);
      try {
        if (o.pttDelayMs) await new Promise((r) => setTimeout(r, o.pttDelayMs));
        await run(o.playCommand, wav, Math.min(o.txTimeoutMs, burst.seconds * 1000 + 30_000));
      } finally {
        await unkey();
      }
      return { frames: burst.frames, seconds: burst.seconds };
    },
    stop: unkey,
  };
}

export function simulateTransmitter(dir: string, log: (m: string) => void): BurstTransmitter {
  return {
    async send(batches, preset, callSign) {
      const burst = buildBurst(batches, preset, callSign);
      const wav = writeWav(dir, burst);
      const heard = listen(burst.audio);
      const count = heard.reduce((n, h) => n + h.prayers.length, 0);
      log(`[simulate] ${wav}: ${burst.frames} frame(s), ${burst.bytes} bytes, ${burst.seconds.toFixed(2)} s on air (${preset.name}); a receiver decodes ${count} prayer(s)`);
      for (const h of heard) for (const p of h.prayers) log(`[simulate]   de ${h.callSign}: ${p}`);
      return { frames: burst.frames, seconds: burst.seconds };
    },
    async stop() {},
  };
}

export function fldigiTransmitter(fldigi: Fldigi, txTimeoutMs: number): BurstTransmitter {
  return {
    async send(batches, _preset, callSign) {
      const started = Date.now();
      // One key-up: every frame on its own line, then ^r returns to receive.
      await fldigi.transmit(batches.map((b) => encodeTextFrame(b, callSign)).join('\n'), txTimeoutMs);
      return { frames: batches.length, seconds: (Date.now() - started) / 1000 };
    },
    stop: () => fldigi.rxOnly(),
  };
}
