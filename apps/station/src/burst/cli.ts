// Burst tools for operators and listeners (node dist/src/burst/cli.js ...):
//
//   decode <file.wav> [report.json]  print every prayer (and packet fallback status) decoded from a recording; with a
//                               report file, also write the measured SNR for BURST_PRESET=auto.
//                               From an HF (SSB) receiver, set BURST_SEARCH_HZ=50 to allow
//                               for tuning up to 50 Hz off (slower)
//   diagnose <file.wav> [--json]  replay a recording through the decoders and say why it did
//                               or didn't decode: level, clipping, hum, noise, each frame's SNR
//                               margin, tuning (docs/RADIO_BURST.md, "Diagnose a weak signal")
//   decode-text <file.txt>      the same for fldigi text frames (BURST_MODE=fldigi)
//   encode <out.wav> [preset]   make a burst from prayers on stdin, one per line
//   presets                     list the modem presets and their speeds
//   bench [preset]              how many sample prayers fit in how many seconds
//                               (BURST_CODEC_V2=on to measure codec 4)
//   sim [preset]                send 30 generated prayers through a simulated radio path at
//                               falling noise levels; print air time and the lowest SNR that
//                               decodes every prayer (the table in docs/RADIO_BURST.md; slow)
//
// A live receiver can record with e.g. `arecord -f S16_LE -r 48000 -c 1 -d 30 rx.wav`.
import { readFileSync, writeFileSync } from 'node:fs';
import { reportFrom, writeReport } from './auto.js';
import { buildBurst, listen, planFrames } from './burst.js';
import { decodeBatch } from './codec.js';
import { PRESETS, presetByName, rawBitRate } from './presets.js';
import { decodeTextFrames } from './text-frame.js';
import { fromWav, resample, toWav } from './wav.js';
import { SAMPLE_RATE } from './ofdm.js';
import { samplePrayers } from './sample.js';
import { simMarkdown, simTable } from './sim.js';
import { diagnose, report as diagnosisReport } from './diagnose.js';
import { demodulate as demodulatePackets } from '../packet/afsk.js';
import { parseStatus } from '../packet/message.js';

const [cmd, arg, arg2] = process.argv.slice(2);

function out(line: string) {
  process.stdout.write(`${line}\n`);
}


switch (cmd) {
  case 'decode': {
    if (!arg) throw new Error('usage: decode <file.wav> [report.json]');
    const wav = fromWav(readFileSync(arg));
    const heard = listen(resample(wav.samples, wav.sampleRate, SAMPLE_RATE), Number(process.env.BURST_SEARCH_HZ ?? 0) || 0);
    const packets = demodulatePackets(wav.samples, wav.sampleRate).flatMap((p) => parseStatus(p.frame) ?? []);
    if (!heard.length && !packets.length) out('No burst frames decoded.');
    for (const h of heard) {
      out(`-- de ${h.callSign} (${h.preset}, ${h.snrDb.toFixed(1)} dB SNR${h.corrected ? ', errors corrected' : ''}), ${h.unreadable ? `unreadable: ${h.unreadable}` : `${h.prayers.length} prayer(s)`}`);
      for (const p of h.prayers) out(p);
    }
    for (const p of packets) out(`-- packet de ${p.callSign}: ${p.count} prayer(s), part ${p.page}/${p.pages}: ${p.ids.join(' ')}`);
    const report = reportFrom(heard);
    if (arg2 && report) {
      await writeReport(arg2, report);
      out(`Channel report (${report.snrDb} dB) -> ${arg2}`);
    }
    break;
  }
  case 'diagnose': {
    if (!arg) throw new Error('usage: diagnose <file.wav> [--json]');
    const wav = fromWav(readFileSync(arg));
    const d = diagnose(wav.samples, wav.sampleRate, { searchHz: Number(process.env.BURST_SEARCH_HZ ?? 50) || 0 });
    if (arg2 === '--json') out(JSON.stringify(d, null, 2));
    else for (const line of diagnosisReport(d)) out(line);
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
    for (const p of PRESETS) out(`${p.name.padEnd(14)} ${(rawBitRate(p) / 1000).toFixed(1)} kbit/s raw, from ${p.minSnrDb} dB  ${p.description}`);
    break;
  case 'bench': {
    const presets = arg ? [presetByName(arg)] : PRESETS;
    for (const p of presets) {
      for (const n of [10, 50, 100, 500]) {
        const prayers = samplePrayers(n);
        const b = buildBurst(planFrames(prayers, p, 20, { codecV2: process.env.BURST_CODEC_V2 === 'on' }), p, 'N0CALL');
        const raw = prayers.join('\n').length;
        out(`${p.name.padEnd(14)} ${String(n).padStart(4)} prayers: ${raw} chars -> ${b.bytes} bytes (${(raw / b.bytes).toFixed(1)}x), ${b.frames} frame(s), ${b.seconds.toFixed(2)} s`);
      }
    }
    break;
  }
  case 'sim':
    out(simMarkdown(simTable(samplePrayers(30), [1, 2, 3], arg ? [presetByName(arg)] : PRESETS), 30));
    break;
  default:
    out('usage: cli.js decode <file.wav> [report.json] | diagnose <file.wav> [--json] | decode-text <file.txt> | encode <out.wav> [preset] | presets | bench [preset] | sim [preset]');
    process.exitCode = cmd ? 1 : 0;
}
