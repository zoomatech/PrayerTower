// Automatic station ID (docs/STATION_OPERATOR_GUIDE.md, "Station ID"), off
// unless STATION_ID=cw. The burst frames already carry the call sign in
// digital form; this adds the call sign in Morse code (CW) at the end of a
// key-up, the first time and then whenever STATION_ID_MINUTES (10) have
// passed since the last one, so anyone can identify the station by ear.

const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '/': '-..-.',
};

/** The Morse code for text, letters separated by spaces and words by " / "; unknown characters are left out. */
export function toMorse(text: string): string {
  return text
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].map((c) => MORSE[c]).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
}

export interface CwOptions {
  wpm: number;
  toneHz: number;
  sampleRate?: number;
  level?: number;
}

/**
 * Audio for text in Morse code at wpm words a minute (PARIS timing: a dot is
 * 1.2/wpm seconds), with 5 ms raised-cosine edges so the keying doesn't click.
 */
export function cwAudio(text: string, o: CwOptions): Float32Array {
  const rate = o.sampleRate ?? 48_000;
  const level = o.level ?? 0.5;
  const dot = Math.round((1.2 / o.wpm) * rate);
  // On/off runs in dot units.
  const runs: [boolean, number][] = [];
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  words.forEach((w, wi) => {
    const letters = [...w].map((c) => MORSE[c]).filter((m): m is string => !!m);
    letters.forEach((code, li) => {
      [...code].forEach((sym, si) => {
        runs.push([true, sym === '.' ? 1 : 3]);
        if (si < code.length - 1) runs.push([false, 1]);
      });
      if (li < letters.length - 1) runs.push([false, 3]);
    });
    if (wi < words.length - 1) runs.push([false, 7]);
  });
  const out = new Float32Array(runs.reduce((n, [, u]) => n + u * dot, 0));
  const ramp = Math.round(0.005 * rate);
  let at = 0;
  for (const [on, units] of runs) {
    const len = units * dot;
    if (on) {
      for (let i = 0; i < len; i++) {
        const edge = Math.min(1, i / ramp, (len - 1 - i) / ramp);
        const env = edge >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, edge));
        out[at + i] = level * env * Math.sin((2 * Math.PI * o.toneHz * (at + i)) / rate);
      }
    }
    at += len;
  }
  return out;
}

/** When the next ID is due: the first key-up, then every intervalMs. */
export class StationId {
  private last = -Infinity;
  constructor(
    readonly callSign: string,
    readonly intervalMs: number,
    readonly cw: CwOptions,
    private readonly now: () => number = Date.now,
  ) {}

  due(): boolean {
    return this.now() - this.last >= this.intervalMs;
  }

  /** For the operator console's ID timer (the "station_id" status check): when it last identified, and how often it must. */
  statusDetail(): string {
    return `last=${Number.isFinite(this.last) ? new Date(this.last).toISOString() : 'never'} every=${Math.round(this.intervalMs / 60_000)}`;
  }

  /** The ID's audio if one is due (and marks it sent), otherwise null. */
  take(sampleRate = 48_000): Float32Array | null {
    if (!this.due()) return null;
    this.last = this.now();
    return cwAudio(`DE ${this.callSign}`, { ...this.cw, sampleRate });
  }

  /** For text modes (fldigi): " de CALL" if one is due (and marks it sent), otherwise ''. */
  takeText(): string {
    if (!this.due()) return '';
    this.last = this.now();
    return `de ${this.callSign}`;
  }
}

/** The burst audio followed by gapSeconds of silence and the ID, when one is due. */
export function withId(audio: Float32Array, id: StationId | undefined, sampleRate = 48_000, gapSeconds = 0.3): Float32Array {
  const cw = id?.take(sampleRate);
  if (!cw) return audio;
  const out = new Float32Array(audio.length + Math.round(gapSeconds * sampleRate) + cw.length);
  out.set(audio);
  out.set(cw, out.length - cw.length);
  return out;
}
