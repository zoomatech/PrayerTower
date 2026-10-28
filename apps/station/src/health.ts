// Station health check (`node dist/src/health.js`): is the worker looping, can
// it reach Prayer Tower, and is fldigi answering and in receive? Exits 0 when
// all pass, 1 otherwise. The installer runs it from a systemd timer.
import { readFileSync, statSync } from 'node:fs';
import { fldigiClient, type Fldigi } from './fldigi.js';

/** The worker's exit code after a failed transmission: it stays stopped until a person checks the station. */
export const EXIT_TRANSMIT_FAILED = 3;

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthOptions {
  apiUrl: string;
  fldigi: Fldigi;
  /** File the worker rewrites every loop; null skips the check. */
  heartbeatFile: string | null;
  /** Oldest acceptable heartbeat. The worker waits up to POLL_SECONDS (or a long transmit) between beats. */
  maxAgeSeconds: number;
  fetchImpl?: typeof fetch;
  now?: Date;
}

export async function checkHealth(o: HealthOptions): Promise<Check[]> {
  const checks: Check[] = [];
  const fetchImpl = o.fetchImpl ?? fetch;

  if (o.heartbeatFile) {
    try {
      const age = ((o.now ?? new Date()).getTime() - statSync(o.heartbeatFile).mtime.getTime()) / 1000;
      checks.push({ name: 'worker', ok: age <= o.maxAgeSeconds, detail: `last loop ${Math.round(age)}s ago` });
    } catch {
      checks.push({ name: 'worker', ok: false, detail: 'no heartbeat yet (is the service running?)' });
    }
  }

  try {
    const res = await fetchImpl(`${o.apiUrl.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(10_000) });
    checks.push({ name: 'prayer tower api', ok: res.ok, detail: `HTTP ${res.status}` });
  } catch (err) {
    checks.push({ name: 'prayer tower api', ok: false, detail: (err as Error).message });
  }

  try {
    const status = (await o.fldigi.status()).toLowerCase();
    // Any other answer means fldigi is up but not in a normal receive or transmit state.
    checks.push({ name: 'fldigi', ok: status.startsWith('rx') || status.startsWith('tx'), detail: `trx status "${status}"` });
  } catch (err) {
    checks.push({ name: 'fldigi', ok: false, detail: `not answering: ${(err as Error).message}` });
  }
  return checks;
}

// CLI ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  // Read the same settings file systemd gives the worker when run by hand.
  const file = process.env.STATION_ENV_FILE ?? '/etc/prayer-tower-station.env';
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^"(.*)"$/, '$1');
    }
  } catch {
    // No settings file: use the environment.
  }
  const apiUrl = process.env.PRAYER_TOWER_API_URL;
  if (!apiUrl) {
    console.error('Set PRAYER_TOWER_API_URL (or STATION_ENV_FILE)');
    process.exit(1);
  }
  const poll = Number(process.env.POLL_SECONDS || 10);
  const tx = Number(process.env.TX_TIMEOUT_SECONDS || 180);
  const checks = await checkHealth({
    apiUrl,
    fldigi: fldigiClient(process.env.FLDIGI_URL || 'http://127.0.0.1:7362/RPC2'),
    heartbeatFile: process.env.HEARTBEAT_FILE ?? '/var/lib/prayer-tower-station/heartbeat',
    // A long prayer may hold the loop for several transmit timeouts.
    maxAgeSeconds: Math.max(120, poll * 3, tx * 4),
  });
  for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: ${c.detail}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
}
