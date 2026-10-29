// A $30 RTL-SDR USB dongle as a listener node's receiver, instead of a radio on the sound card
// (docs/STATION_OPERATOR_GUIDE.md, "Listener with an RTL-SDR dongle"). Off unless
// LISTEN_SOURCE=rtlsdr. The node runs rtl_fm (from the rtl-sdr package on Debian and Raspberry
// Pi OS, librtlsdr on Homebrew), which tunes the dongle, demodulates and writes 16-bit mono audio
// on stdout: the same stream a sound card recorder gives (listener.ts startRecorder).
//
//   LISTEN_SOURCE=rtlsdr
//   LISTEN_SDR_FREQ    the station's frequency: Hz, or with k/M (146.52M) (required)
//   LISTEN_SDR_MODE    fm (default) or usb (HF SSB; needs a dongle that tunes HF, see LISTEN_SDR_DIRECT)
//   LISTEN_SDR_GAIN    auto (default) or the tuner gain in dB (rtl_test lists the steps)
//   LISTEN_SDR_PPM     the dongle's frequency error in parts per million (0)
//   LISTEN_SDR_DEVICE  which dongle, by index (0)
//   LISTEN_SDR_DIRECT  on: direct sampling, for HF on a dongle without an upconverter (off)

export interface SdrSettings {
  freqHz: number;
  mode: 'fm' | 'usb';
  gain: 'auto' | number;
  ppm: number;
  device: number;
  direct: boolean;
}

/** What rtl_fm tunes and how it is heard, for Admin → Radio (sent with the heartbeat). */
export interface Receiver {
  kind: 'sound-card' | 'rtl-sdr';
  freqHz?: number;
  mode?: 'fm' | 'usb';
}

/** "146.52M", "146520000", "14.0705M" or "446k" in hertz; null when it isn't a frequency. */
export function parseFrequency(text: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kKmMgG]?)(?:[hH][zZ])?\s*$/.exec(text);
  if (!m) return null;
  const hz = Number(m[1]) * { '': 1, k: 1e3, m: 1e6, g: 1e9 }[m[2]!.toLowerCase() as '' | 'k' | 'm' | 'g'];
  return Number.isFinite(hz) && hz > 0 ? Math.round(hz) : null;
}

/** The dongle's settings, or null when the node records from a sound card (LISTEN_SOURCE unset). */
export function sdrSettings(env: Record<string, string | undefined>): SdrSettings | null {
  const source = env.LISTEN_SOURCE || 'soundcard';
  if (source === 'soundcard') return null;
  if (source !== 'rtlsdr') throw new Error('LISTEN_SOURCE must be soundcard or rtlsdr');
  const freqHz = parseFrequency(env.LISTEN_SDR_FREQ ?? '');
  // RTL2832 dongles tune about 24 MHz to 1.7 GHz, and 0.5 to 28.8 MHz with direct sampling.
  if (!freqHz || freqHz < 500e3 || freqHz > 1.8e9) throw new Error('Set LISTEN_SDR_FREQ to the station\'s frequency, e.g. 146.52M');
  const mode = env.LISTEN_SDR_MODE || 'fm';
  if (mode !== 'fm' && mode !== 'usb') throw new Error('LISTEN_SDR_MODE must be fm or usb');
  const gainText = env.LISTEN_SDR_GAIN || 'auto';
  const gain = gainText === 'auto' ? 'auto' : Number(gainText);
  if (gain !== 'auto' && !(Number.isFinite(gain) && gain >= 0 && gain <= 60)) throw new Error('LISTEN_SDR_GAIN must be auto or a gain in dB from 0 to 60');
  const ppm = Number(env.LISTEN_SDR_PPM || 0);
  if (!Number.isInteger(ppm) || Math.abs(ppm) > 200) throw new Error('LISTEN_SDR_PPM must be a whole number from -200 to 200');
  const device = Number(env.LISTEN_SDR_DEVICE || 0);
  if (!Number.isInteger(device) || device < 0 || device > 15) throw new Error('LISTEN_SDR_DEVICE must be a dongle index from 0 to 15');
  const direct = env.LISTEN_SDR_DIRECT === 'on';
  if (!direct && freqHz < 24e6) throw new Error('Below 24 MHz an RTL-SDR needs LISTEN_SDR_DIRECT=on (direct sampling) or an upconverter');
  return { freqHz, mode, gain, ppm, device, direct };
}

/**
 * The rtl_fm command: 48 kHz 16-bit mono on stdout, which is what the listener reads. FM is
 * demodulated at 24 kHz (wide enough for a 12.5 kHz channel with 3 kHz of deviation) and SSB at
 * 12 kHz, then resampled to 48 kHz (-r). No squelch, so the audio never stops and a burst's
 * first symbols are never cut off.
 */
export function rtlFmCommand(s: SdrSettings): string {
  const args = ['rtl_fm', '-d', String(s.device), '-f', String(s.freqHz), '-M', s.mode, '-s', s.mode === 'fm' ? '24000' : '12000', '-r', '48000', '-l', '0'];
  if (s.gain !== 'auto') args.push('-g', String(s.gain));
  if (s.ppm) args.push('-p', String(s.ppm));
  if (s.direct) args.push('-E', 'direct');
  args.push('-');
  return args.join(' ');
}

/** What the node listens with, for its heartbeat. */
export function receiverOf(s: SdrSettings | null): Receiver {
  return s ? { kind: 'rtl-sdr', freqHz: s.freqHz, mode: s.mode } : { kind: 'sound-card' };
}
