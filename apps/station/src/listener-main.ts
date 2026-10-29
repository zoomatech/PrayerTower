// Listener node entry point (node dist/src/listener-main.js). Settings
// (docs/STATION_OPERATOR_GUIDE.md, "Listener nodes"):
//   PRAYER_TOWER_API_URL, NODE_KEY (from Admin → Radio → Listener nodes; required)
//   LISTEN_RECORD_CMD (arecord on Linux, sox's rec on macOS: 48 kHz mono 16-bit raw on stdout)
//   LISTEN_SEARCH_HZ (0; 50 for an HF SSB receiver), LISTEN_DECODE_SECONDS (6),
//   LISTEN_RECEIPTS (on), LISTEN_REPORT_FILE (also write the report here for a station on this machine)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultRecordCommand, httpListenerApi, listenOnce, RollingDecoder, startRecorder } from './listener.js';

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
};
const num = (name: string, fallback: number, min: number, max: number) => {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} must be a number from ${min} to ${max}`);
  return n;
};

const api = httpListenerApi(need('PRAYER_TOWER_API_URL'), need('NODE_KEY'));
const cfg = {
  searchHz: num('LISTEN_SEARCH_HZ', 0, 0, 200),
  receipts: (process.env.LISTEN_RECEIPTS ?? 'on') !== 'off',
  reportFile: process.env.LISTEN_REPORT_FILE || undefined,
};
const everyMs = num('LISTEN_DECODE_SECONDS', 6, 1, 20) * 1000;
const stateDir = process.env.STATE_DIRECTORY?.split(':')[0];
const heartbeat = stateDir ? path.join(stateDir, 'heartbeat') : null;

const dec = new RollingDecoder();
const command = process.env.LISTEN_RECORD_CMD || defaultRecordCommand();
const recorder = startRecorder(command, dec);
console.log(`[listener] listening (${command}), decoding every ${everyMs / 1000}s${cfg.searchHz ? `, ±${cfg.searchHz} Hz search` : ''}`);

let stopping = false;
const stop = () => {
  stopping = true;
  recorder.stop();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
while (!stopping) {
  await new Promise((r) => setTimeout(r, everyMs));
  if (heartbeat) {
    try {
      writeFileSync(heartbeat, new Date().toISOString());
    } catch {
      // Not fatal.
    }
  }
  await listenOnce(dec, api, cfg).catch((err: Error) => console.error(`[listener] ${err.message}`));
}
