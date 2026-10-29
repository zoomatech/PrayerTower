// Station entry point. Configure with environment variables (see docs/RADIO_STATION.md):
//   PRAYER_TOWER_API_URL, STATION_API_KEY, CALL_SIGN (required)
//   FLDIGI_URL (default http://127.0.0.1:7362/RPC2), MODEM (BPSK31), POLL_SECONDS (10),
//   TX_TIMEOUT_SECONDS (180), MAX_PIECE_CHARS (500), BLOCKLIST_FILE (one word per line, added to the default list)
// Burst mode (docs/RADIO_BURST.md), off unless BURST_MODE is set:
//   BURST_MODE (off | audio | fldigi | simulate), BURST_PRESET (fm-standard), BURST_MAX_PRAYERS (50),
//   BURST_MAX_FRAME_SECONDS (20), BURST_PLAY_CMD ("aplay -q {wav}"), BURST_PTT_ON_CMD, BURST_PTT_OFF_CMD,
//   BURST_PTT_DELAY_MS (300), BURST_DIR (bursts/ under the state directory), BURST_FLDIGI_MODEM (8PSK1000F)
// BURST_PRESET=auto picks a preset before each burst from a receiver's channel report:
//   BURST_AUTO_REPORT (file or URL; BURST_DIR/channel.json), BURST_AUTO_PRESETS (the FM presets
//   without QAM), BURST_AUTO_MARGIN_DB (3), BURST_AUTO_MAX_AGE_MIN (30). Simulate mode can add
//   noise with BURST_SIM_SNR_DB and writes its receiver's report to BURST_AUTO_REPORT.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fldigiClient } from './fldigi.js';
import { DEFAULT_BLOCKLIST } from './text.js';
import { EXIT_TRANSMIT_FAILED } from './health.js';
import { httpApi, runOnce, TransmitError } from './worker.js';
import { autoChooser, DEFAULT_AUTO_PRESETS, parseCandidates } from './burst/auto.js';
import { presetByName } from './burst/presets.js';
import { audioTransmitter, fldigiTransmitter, simulateTransmitter, type BurstTransmitter } from './burst/transmit.js';
import { runBurstOnce } from './burst/worker.js';

const env = (name: string, fallback?: string) => {
  const v = process.env[name] || fallback;
  if (v === undefined) throw new Error(`Set ${name}`);
  return v;
};

/** A whole number setting within [min, max]; a typo would otherwise break the piece splitter or the poll loop. */
const int = (name: string, fallback: string, min: number, max: number) => {
  const n = Number(env(name, fallback));
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return n;
};

const callSign = env('CALL_SIGN').toUpperCase();
if (!/^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z](\/[A-Z0-9]+)?$/.test(callSign)) throw new Error(`CALL_SIGN "${callSign}" does not look like a call sign`);
if (callSign === 'N0CALL') console.warn('[station] CALL_SIGN is the N0CALL placeholder: only use it with a dummy load');

const extra = process.env.BLOCKLIST_FILE
  ? readFileSync(process.env.BLOCKLIST_FILE, 'utf8').split('\n').map((w) => w.trim().toLowerCase()).filter(Boolean)
  : [];
const cfg = {
  callSign,
  modem: env('MODEM', 'BPSK31'),
  maxPieceChars: int('MAX_PIECE_CHARS', '500', 20, 2800),
  txTimeoutMs: int('TX_TIMEOUT_SECONDS', '180', 10, 3600) * 1000,
  blocklist: [...DEFAULT_BLOCKLIST, ...extra],
};
const pollMs = int('POLL_SECONDS', '10', 1, 3600) * 1000;
const burstMode = env('BURST_MODE', 'off');
if (!['off', 'audio', 'fldigi', 'simulate'].includes(burstMode)) throw new Error('BURST_MODE must be off, audio, fldigi or simulate');
const usesFldigi = burstMode === 'off' || burstMode === 'fldigi';
const api = httpApi(env('PRAYER_TOWER_API_URL'), env('STATION_API_KEY'));
const fldigi = fldigiClient(env('FLDIGI_URL', 'http://127.0.0.1:7362/RPC2'));
const stateDir = process.env.STATE_DIRECTORY?.split(':')[0];

// Under systemd, STATE_DIRECTORY is /var/lib/prayer-tower-station; the health check reads the heartbeat there.
const heartbeat = stateDir ? path.join(stateDir, 'heartbeat') : null;

let burst: { tx: BurstTransmitter; cfg: Parameters<typeof runBurstOnce>[2] } | null = null;
if (burstMode !== 'off') {
  const dir = env('BURST_DIR', path.join(stateDir ?? '.', 'bursts'));
  const reportSource = env('BURST_AUTO_REPORT', path.join(dir, 'channel.json'));
  const simSnr = process.env.BURST_SIM_SNR_DB;
  if (simSnr !== undefined && !Number.isFinite(Number(simSnr))) throw new Error('BURST_SIM_SNR_DB must be a number');
  const auto = env('BURST_PRESET', 'fm-standard') === 'auto';
  const tx =
    burstMode === 'simulate'
      ? simulateTransmitter(dir, console.log, {
          snrDb: simSnr === undefined ? undefined : Number(simSnr),
          reportFile: /^https?:/.test(reportSource) ? undefined : reportSource,
        })
      : burstMode === 'fldigi'
        ? fldigiTransmitter(fldigi, cfg.txTimeoutMs)
        : audioTransmitter({
            playCommand: env('BURST_PLAY_CMD', 'aplay -q {wav}'),
            pttOnCommand: process.env.BURST_PTT_ON_CMD ?? '',
            pttOffCommand: process.env.BURST_PTT_OFF_CMD ?? '',
            pttDelayMs: int('BURST_PTT_DELAY_MS', '300', 0, 5000),
            dir,
            txTimeoutMs: cfg.txTimeoutMs,
          });
  burst = {
    tx,
    cfg: {
      callSign,
      preset: auto ? presetByName('fm-standard') : presetByName(env('BURST_PRESET', 'fm-standard')),
      choosePreset: auto
        ? autoChooser(
            {
              report: reportSource,
              candidates: parseCandidates(env('BURST_AUTO_PRESETS', DEFAULT_AUTO_PRESETS.join(','))),
              marginDb: int('BURST_AUTO_MARGIN_DB', '3', 0, 20),
              maxAgeMs: int('BURST_AUTO_MAX_AGE_MIN', '30', 1, 1440) * 60_000,
            },
            console.log,
          )
        : undefined,
      maxPrayers: int('BURST_MAX_PRAYERS', '50', 1, 500),
      maxFrameSeconds: int('BURST_MAX_FRAME_SECONDS', '20', 1, 120),
      blocklist: cfg.blocklist,
    },
  };
}
const beat = () => {
  if (heartbeat) {
    try {
      writeFileSync(heartbeat, new Date().toISOString());
    } catch {
      // The health check reports a stale heartbeat; the worker keeps going.
    }
  }
};

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

if (burstMode === 'fldigi') await fldigi.setModem(env('BURST_FLDIGI_MODEM', '8PSK1000F'));
else if (usesFldigi) await fldigi.setModem(cfg.modem);
console.log(
  `[station] ${callSign} ready, ${burst ? `burst ${burstMode} ${burst.cfg.choosePreset ? 'auto preset' : burst.cfg.preset.name}, up to ${burst.cfg.maxPrayers} prayers a burst` : cfg.modem}, polling every ${pollMs / 1000}s`,
);
while (!stopping) {
  beat();
  try {
    const idle = burst ? (await runBurstOnce(api, burst.tx, burst.cfg)).kind === 'idle' : (await runOnce(api, fldigi, cfg)) === 'idle';
    if (idle) await new Promise((r) => setTimeout(r, pollMs));
  } catch (err) {
    if (err instanceof TransmitError) {
      // Transmit is already disabled (rx_only); stop so a person can check the station.
      console.error(`[station] stopping: ${err.message}`);
      // A distinct exit code, so systemd does not restart it (RestartPreventExitStatus).
      process.exitCode = EXIT_TRANSMIT_FAILED;
      break;
    }
    // The API is unreachable or refused (e.g. not in station mode): wait and try again.
    console.error(`[station] ${(err as Error).message}`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
if (burst) await burst.tx.stop().catch(() => undefined);
if (usesFldigi) await fldigi.rxOnly().catch(() => undefined);
