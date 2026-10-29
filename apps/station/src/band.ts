// Band plan on the station (docs/STATION_OPERATOR_GUIDE.md, "Band plan"), off unless
// BAND_PLAN=server. Before each burst the station asks the server which band to use
// (GET /station/band: on HF it is picked from NOAA space weather) and, when it changed,
// retunes the radio through rigctld. The band's preset, when the plan names one, is
// used for that burst. Needs RIG_CONTROL=rigctld.
//   BAND_PLAN_USB_MODE (USB; PKTUSB for a radio with a data mode), BAND_PLAN_FM_MODE (FM)
import { presetByName, type BurstPreset } from './burst/presets.js';
import type { Rig } from './rig.js';
import type { BandPick, StationApi } from './worker.js';

export interface BandModes {
  usb: string;
  fm: string;
}

/** The burst loop's beforeBurst hook: retune when the server's band changes; null while the plan is off. */
export function bandFollower(api: Pick<StationApi, 'band'>, rig: Rig, modes: BandModes, log: (m: string) => void = console.log) {
  let tunedTo: number | null = null;
  return async (): Promise<{ preset?: BurstPreset; frequencyHz?: number } | null> => {
    const pick: BandPick | null = (await api.band?.()) ?? null;
    if (!pick) return null;
    const { band } = pick;
    if (band.freqHz !== tunedTo) {
      await rig.setFrequency(band.freqHz);
      await rig.setMode(band.mode === 'usb' ? modes.usb : modes.fm, 0);
      tunedTo = band.freqHz;
      log(`[band] ${band.label}: ${(band.freqHz / 1e6).toFixed(4)} MHz ${band.mode.toUpperCase()}${pick.mufMhz ? ` (estimated MUF ${pick.mufMhz} MHz)` : ''}`);
    }
    let preset: BurstPreset | undefined;
    if (band.preset) {
      try {
        preset = presetByName(band.preset);
      } catch {
        log(`[band] unknown preset "${band.preset}" in the band plan; using the station's own`);
      }
    }
    return { preset, frequencyHz: band.freqHz };
  };
}
