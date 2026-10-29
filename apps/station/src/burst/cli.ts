// Burst tools for operators and listeners (node dist/src/burst/cli.js ...):
//
//   decode <file.wav>           print every prayer decoded from a recording
//   decode-text <file.txt>      the same for fldigi text frames (BURST_MODE=fldigi)
//   encode <out.wav> [preset]   make a burst from prayers on stdin, one per line
//   presets                     list the modem presets and their speeds
//   bench [preset]              how many sample prayers fit in how many seconds
//
// A live receiver can record with e.g. `arecord -f S16_LE -r 48000 -c 1 -d 30 rx.wav`.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildBurst, listen, planFrames } from './burst.js';
import { decodeBatch } from './codec.js';
import { PRESETS, presetByName, rawBitRate } from './presets.js';
import { decodeTextFrames } from './text-frame.js';
import { fromWav, resample, toWav } from './wav.js';
import { SAMPLE_RATE } from './ofdm.js';
import { samplePrayers } from './sample.js';

const [cmd, arg, arg2] = process.argv.slice(2);

function out(line: string) {
  process.stdout.write(`${line}\n`);
}


switch (cmd) {
  case 'decode': {
    if (!arg) throw new Error('usage: decode <file.wav>');
    const wav = fromWav(readFileSync(arg));
    const heard = listen(resample(wav.samples, wav.sampleRate, SAMPLE_RATE));
    if (!heard.length) out('No burst frames decoded.');
    for (const h of heard) {
      out(`-- de ${h.callSign} (${h.preset}${h.corrected ? ', errors corrected' : ''}), ${h.prayers.length} prayer(s)`);
      for (const p of h.prayers) out(p);
    }
    break;
  }
  case 'decode-text': {
    if (!arg) throw new Error('usage: decode-text <file.txt>');
    const frames = decodeTextFrames(readFileSync(arg, 'utf8'));
    if (!frames.length) out('No intact text frames found.');
    for (const f of frames) {
      const prayers = decodeBatch(f.batch);
      out(`-- de ${f.callSign}, ${prayers.length} prayer(s)`);
      for (const p of prayers) out(p);
    }
    break;
  }
  case 'encode': {
    if (!arg) throw new Error('usage: encode <out.wav> [preset] < prayers.txt');
    const preset = presetByName(arg2 ?? 'fm-standard');
    const prayers = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    const burst = buildBurst(planFrames(prayers, preset, 20), preset, process.env.CALL_SIGN ?? 'N0CALL');
    writeFileSync(arg, toWav(burst.audio, burst.sampleRate));
    out(`${prayers.length} prayer(s), ${burst.frames} frame(s), ${burst.bytes} bytes, ${burst.seconds.toFixed(2)} s -> ${arg}`);
    break;
  }
  case 'presets':
    for (const p of PRESETS) out(`${p.name.padEnd(14)} ${(rawBitRate(p) / 1000).toFixed(1)} kbit/s raw  ${p.description}`);
    break;
  case 'bench': {
    const presets = arg ? [presetByName(arg)] : PRESETS;
    for (const p of presets) {
      for (const n of [10, 50, 100, 500]) {
        const prayers = samplePrayers(n);
        const b = buildBurst(planFrames(prayers, p, 20), p, 'N0CALL');
        const raw = prayers.join('\n').length;
        out(`${p.name.padEnd(14)} ${String(n).padStart(4)} prayers: ${raw} chars -> ${b.bytes} bytes (${(raw / b.bytes).toFixed(1)}x), ${b.frames} frame(s), ${b.seconds.toFixed(2)} s`);
      }
    }
    break;
  }
  default:
    out('usage: cli.js decode <file.wav> | decode-text <file.txt> | encode <out.wav> [preset] | presets | bench [preset]');
    process.exitCode = cmd ? 1 : 0;
}
