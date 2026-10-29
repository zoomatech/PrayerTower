// Listener node entry point (node dist/src/listener-main.js). Settings
// (docs/STATION_OPERATOR_GUIDE.md, "Listener nodes"):
//   PRAYER_TOWER_API_URL, NODE_KEY (from Admin → Radio → Listener nodes; required)
//   LISTEN_RECORD_CMD (arecord on Linux, sox's rec on macOS: 48 kHz mono 16-bit raw on stdout)
//   LISTEN_SEARCH_HZ (0; 50 for an HF SSB receiver), LISTEN_DECODE_SECONDS (6),
//   LISTEN_RECEIPTS (on: report decoded prayers' fingerprints, for acknowledgements and receipts), LISTEN_REPORT_FILE (also write the report here for a station on this machine)
//   LISTEN_SIGN (off; on: sign each report with the key instead of sending it, docs "Signed listener reports")
//   NODE_LOCATION (unset: share nothing): "lat,lon" or "lat,lon,Place" for Admin → Radio's coverage map, rounded to about a city
//   RELAY (off; on: re-send decoded bursts, docs/RADIO_BURST.md "Store-and-forward relay"): RELAY_CALL_SIGN, RELAY_FROM,
//   RELAY_MAX_HOPS (1), RELAY_MAX_SECONDS_PER_HOUR (120), RELAY_DELAY_MS (1000), RELAY_MODE (simulate | audio),
//   RELAY_PLAY_CMD, RELAY_PTT_ON_CMD, RELAY_PTT_OFF_CMD, RELAY_PTT_DELAY_MS (300)
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { audioTransmitter, simulateTransmitter } from './burst/transmit.js';
import { Relay, relayConfig } from './relay.js';
import { checkApiUrl } from './secure-url.js';
import { defaultRecordCommand, httpListenerApi, listenOnce, Outbox, parseLocation, RollingDecoder, startRecorder } from './listener.js';

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

const api = httpListenerApi(checkApiUrl(need('PRAYER_TOWER_API_URL')), need('NODE_KEY'), fetch, { sign: process.env.LISTEN_SIGN === 'on' });
const stateDir = process.env.STATE_DIRECTORY?.split(':')[0];
const cfg = {
  searchHz: num('LISTEN_SEARCH_HZ', 0, 0, 200),
  receipts: (process.env.LISTEN_RECEIPTS ?? 'on') !== 'off',
  reportFile: process.env.LISTEN_REPORT_FILE || undefined,
  // Reports that fail during an internet or server outage are sent when it comes back.
  // Kept in the state directory, so they also survive a restart or a power cut.
  outbox: new Outbox({ file: stateDir ? path.join(stateDir, 'outbox.json') : undefined }),
};
const location = parseLocation(process.env.NODE_LOCATION);
const everyMs = num('LISTEN_DECODE_SECONDS', 6, 1, 20) * 1000;
const heartbeat = stateDir ? path.join(stateDir, 'heartbeat') : null;

// Store-and-forward relay: off unless RELAY=on (relay.ts).
const relayCfg = relayConfig(process.env);
let relay: Relay | null = null;
if (relayCfg) {
  const dir = path.join(stateDir ?? '.', 'relay');
  const mode = process.env.RELAY_MODE ?? 'simulate';
  if (mode !== 'simulate' && mode !== 'audio') throw new Error('RELAY_MODE must be simulate or audio');
  const tx =
    mode === 'audio'
      ? audioTransmitter({
          playCommand: process.env.RELAY_PLAY_CMD || (process.platform === 'darwin' ? 'afplay {wav}' : 'aplay -q {wav}'),
          pttOnCommand: process.env.RELAY_PTT_ON_CMD ?? '',
          pttOffCommand: process.env.RELAY_PTT_OFF_CMD ?? '',
          pttDelayMs: num('RELAY_PTT_DELAY_MS', 300, 0, 5000),
          dir,
          txTimeoutMs: 120_000,
        })
      : simulateTransmitter(dir, (m) => console.log(`[relay] ${m}`));
  relay = new Relay(relayCfg, tx);
  console.log(`[relay] on (${mode}) as ${relayCfg.callSign}, relaying ${relayCfg.from.join(', ')}, up to ${relayCfg.maxHops} hop(s)`);
}

const dec = new RollingDecoder();
const command = process.env.LISTEN_RECORD_CMD || defaultRecordCommand();
const recorder = startRecorder(command, dec);
console.log(`[listener] listening (${command}), decoding every ${everyMs / 1000}s${cfg.searchHz ? `, ±${cfg.searchHz} Hz search` : ''}`);

// The server resends prayers nobody heard only while a listener is running (radio/acks.ts).
const beat = () => api.heartbeat(location, relay?.status()).catch((err: Error) => console.error(`[listener] ${err.message}`));
void beat();
const beating = setInterval(beat, 60_000);

let stopping = false;
const stop = () => {
  stopping = true;
  clearInterval(beating);
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
  const frames = await listenOnce(dec, api, cfg).catch((err: Error) => {
    console.error(`[listener] ${err.message}`);
    return [];
  });
  for (const f of frames) {
    if (!relay) break;
    const r = await relay.consider(f).catch((err: Error) => ({ relayed: false as const, reason: err.message }));
    console.log(r.relayed ? `[relay] re-sent ${f.callSign}'s frame (${r.seconds.toFixed(2)} s)` : `[relay] not re-sent (${r.reason}): ${f.callSign}`);
  }
}
