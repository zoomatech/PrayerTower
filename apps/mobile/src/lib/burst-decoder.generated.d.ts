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
