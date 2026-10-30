// Types for burst-decoder.generated.js, the station's decoder (apps/station/src/burst/web.ts)
// bundled by apps/station/scripts/build-listen.ts. Keep in step with web.ts.
export interface HeardFrame {
  callSign: string;
  preset: string;
  snrDb: number;
  corrected: boolean;
  /** The prayers, or null when the frame used a codec the decoder can't unpack. */
  prayers: string[] | null;
  codec: number;
  start: number;
  end: number;
}
export interface ChannelReport {
  snrDb: number;
  at: string;
  callSign: string;
  preset: string;
}
export const SAMPLE_RATE: number;
/** searchHz: allow an HF (SSB) receiver tuned up to this far off (slower). */
export function decodeAudio(samples: Float32Array, rate: number, searchHz?: number): HeardFrame[];
export function channelReport(frames: readonly HeardFrame[], now?: Date): ChannelReport | null;
export function fingerprint(text: string): string;

/** The prayer panel (apps/station/src/panel): read from a picture or from SSTV Robot 36 audio. */
export interface PanelRead {
  callSign: string;
  prayers: string[] | null;
  corrected: boolean;
}
/** As many of the prayers as fit one panel: width x height cells, row by row, 1 black. */
export function drawPanel(prayers: readonly string[], callSign: string): { cells: Uint8Array; count: number; width: number; height: number };
/** A panel in a grayscale picture (0 black .. 255 white), or null. */
export function readPanel(gray: Uint8Array, width: number, height: number): PanelRead | null;
/** An SSTV Robot 36 picture in the audio, and the panel in it; start and end in samples. */
export function readSstv(samples: Float32Array, rate: number): { panel: PanelRead | null; gray: Uint8Array; start: number; end: number } | null;
