// The decoder as the browser listening page uses it (docs/RADIO_BURST.md,
// "Listen in a browser"). No Node APIs here: the build script bundles this
// file for the page, which feeds it microphone audio and shows each frame.
// Codecs 0 (plain), 3 (context mixing, what the station almost always
// picks) and 4 (context mixing v2) decode here; frames that used DEFLATE or Brotli say so instead.
import type { ChannelReport } from './auto.js';
import { cmDecompress } from './cm.js';
import { DICTIONARY_V1 } from './dictionary.js';
import { demodulate, SAMPLE_RATE } from './ofdm.js';
import { PRIMER_V1 } from './primer.js';
import { PRIMER_V2_EXTRA } from './primer2.js';
import { unwrapRelay } from './relay-frame.js';
import { resample } from './wav.js';
import { demodulate as demodulatePackets } from '../packet/afsk.js';
import { parseStatus, type PacketStatus } from '../packet/message.js';
import { finiteSamples } from './samples.js';
import { decodePanelImage, encodePanel, GRID_H, GRID_W } from '../panel/panel.js';
import { decodeRobot36 } from '../panel/sstv.js';

const latin1 = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
let primer: Uint8Array | null = null;
let primer2: Uint8Array | null = null;

export interface HeardFrame {
  callSign: string;
  preset: string;
  snrDb: number;
  corrected: boolean;
  /** The prayers, or null when the frame used a codec the page can't unpack. */
  prayers: string[] | null;
  codec: number;
  /** The batch as it arrived (a relay re-sends it, relay.ts). */
  batch: Uint8Array;
  /** A relay re-sent it: callSign is the station it came from, via the relay, after this many hops. */
  via?: string;
  hops?: number;
  /** Where the frame ended, in 48 kHz samples from the start of the audio given. */
  end: number;
  start: number;
}

function unpack(batch: Uint8Array): string[] | null {
  try {
    return unpackOrThrow(batch);
  } catch {
    return null;
  }
}

function unpackOrThrow(batch: Uint8Array): string[] | null {
  const body = batch.subarray(1);
  let bytes: Uint8Array;
  if (batch[0] === 0) bytes = body;
  else if (batch[0] === 3) bytes = cmDecompress(body, (primer ??= latin1(PRIMER_V1 + DICTIONARY_V1)), 'v1');
  else if (batch[0] === 4) bytes = cmDecompress(body, (primer2 ??= latin1(PRIMER_V1 + PRIMER_V2_EXTRA + DICTIONARY_V1)), 'v2', 2);
  else return null;
  let text = '';
  for (let i = 0; i < bytes.length; i += 4096) text += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return text ? text.split('\n') : [];
}

/** Decode every frame in audio recorded at `rate` samples a second. searchHz: allow an HF (SSB) receiver tuned up to this far off. */
export function decodeAudio(samples: Float32Array, rate: number, searchHz = 0): HeardFrame[] {
  return demodulate(resample(finiteSamples(samples), rate, SAMPLE_RATE), 0.4, searchHz).map((f) => {
    const relayed = unwrapRelay(f.batch);
    const inner = relayed?.inner ?? f.batch;
    return {
      callSign: relayed?.origin ?? f.callSign,
      ...(relayed ? { via: f.callSign, hops: relayed.hops } : {}),
      preset: f.preset,
      snrDb: f.snrDb,
      corrected: f.corrected,
      prayers: unpack(inner),
      codec: inner[0] ?? -1,
      batch: f.batch,
      start: f.start,
      end: f.end,
    };
  });
}

/** The channel report a station's BURST_PRESET=auto reads (auto.ts), for the frames heard. */
export function channelReport(frames: readonly HeardFrame[], now = new Date()): ChannelReport | null {
  if (!frames.length) return null;
  const weakest = frames.reduce((a, b) => (b.snrDb < a.snrDb ? b : a));
  return { snrDb: Math.round(weakest.snrDb * 10) / 10, at: now.toISOString(), callSign: weakest.callSign, preset: weakest.preset };
}

export { SAMPLE_RATE };
/** Receipt fingerprint of a decoded prayer, as the station reports it ("Receipts" in docs/RADIO_BURST.md). */
export { fingerprint } from './sha256.js';

/** The packet fallback's status packets (packet/message.ts) in the audio, each with the sample where it ended. */
export function decodePackets(samples: Float32Array, rate: number): (PacketStatus & { end: number })[] {
  return demodulatePackets(samples, rate).flatMap((p) => {
    const s = parseStatus(p.frame);
    return s ? [{ ...s, end: p.end }] : [];
  });
}

/** Decode replay and diagnostics for a recording (diagnose.ts): level, clipping, hum, SNR margins and advice. */
export { diagnose, report as diagnosisReport } from './diagnose.js';

// The prayer panel and SSTV (../panel): drawing a panel to show or print, reading one from a
// picture (a camera photo, a screenshot), and finding one in SSTV Robot 36 audio.

export interface PanelRead {
  callSign: string;
  /** The prayers, or null for a codec the apps can't unpack. */
  prayers: string[] | null;
  corrected: boolean;
}

/** As many of the prayers (folded to ASCII) as fit one panel: GRID_W x GRID_H cells, 1 black. */
export function drawPanel(prayers: readonly string[], callSign: string): { cells: Uint8Array; count: number; width: number; height: number } {
  const p = encodePanel(prayers, callSign);
  return { ...p, width: GRID_W, height: GRID_H };
}

/** Read a panel in a grayscale picture (0 black .. 255 white); null when there is none to read. */
export function readPanel(gray: Uint8Array, width: number, height: number): PanelRead | null {
  const f = decodePanelImage(gray, width, height);
  return f ? { callSign: f.callSign, prayers: unpack(f.batch), corrected: f.corrected } : null;
}

/** Find an SSTV Robot 36 picture in the audio and read the panel in it; where it started and ended, in samples. */
export function readSstv(samples: Float32Array, rate: number): { panel: PanelRead | null; gray: Uint8Array; start: number; end: number } | null {
  const pic = decodeRobot36(finiteSamples(samples), rate);
  if (!pic) return null;
  return { panel: readPanel(pic.gray, 320, 240), gray: pic.gray, start: pic.start, end: pic.end };
}
