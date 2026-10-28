// Station entry point. Configure with environment variables (see docs/RADIO_STATION.md):
//   PRAYER_TOWER_API_URL, STATION_API_KEY, CALL_SIGN (required)
//   FLDIGI_URL (default http://127.0.0.1:7362/RPC2), MODEM (BPSK31), POLL_SECONDS (10),
//   TX_TIMEOUT_SECONDS (180), MAX_PIECE_CHARS (500), BLOCKLIST_FILE (one word per line, added to the default list)
import { readFileSync } from 'node:fs';
import { fldigiClient } from './fldigi.js';
import { DEFAULT_BLOCKLIST } from './text.js';
import { httpApi, runOnce, TransmitError } from './worker.js';

const env = (name: string, fallback?: string) => {
  const v = process.env[name] || fallback;
  if (v === undefined) throw new Error(`Set ${name}`);
  return v;
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
  maxPieceChars: Number(env('MAX_PIECE_CHARS', '500')),
  txTimeoutMs: Number(env('TX_TIMEOUT_SECONDS', '180')) * 1000,
  blocklist: [...DEFAULT_BLOCKLIST, ...extra],
};
const pollMs = Number(env('POLL_SECONDS', '10')) * 1000;
const api = httpApi(env('PRAYER_TOWER_API_URL'), env('STATION_API_KEY'));
const fldigi = fldigiClient(env('FLDIGI_URL', 'http://127.0.0.1:7362/RPC2'));

let stopping = false;
process.on('SIGINT', () => (stopping = true));
process.on('SIGTERM', () => (stopping = true));

await fldigi.setModem(cfg.modem);
console.log(`[station] ${callSign} ready, ${cfg.modem}, polling every ${pollMs / 1000}s`);
while (!stopping) {
  try {
    const outcome = await runOnce(api, fldigi, cfg);
    if (outcome === 'idle') await new Promise((r) => setTimeout(r, pollMs));
  } catch (err) {
    if (err instanceof TransmitError) {
      // Transmit is already disabled (rx_only); stop so a person can check the station.
      console.error(`[station] stopping: ${err.message}`);
      process.exitCode = 1;
      break;
    }
    // The API is unreachable or refused (e.g. not in station mode): wait and try again.
    console.error(`[station] ${(err as Error).message}`);
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
await fldigi.rxOnly().catch(() => undefined);
