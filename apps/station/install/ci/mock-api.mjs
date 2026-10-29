// A stand-in Prayer Tower API for the installer dry run (dry-run.sh): hands the station two
// prayers once, then nothing, and writes every call it gets to a JSON file the dry run checks.
// Plain Node, no packages, so it runs before anything is installed.
//   node mock-api.mjs <log.json> [port]
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const [file, port = '8787'] = process.argv.slice(2);
if (!file) throw new Error('usage: node mock-api.mjs <log.json> [port]');
export const PRAYERS = [
  { id: 'ci-1', text: 'Peace for our town.' },
  { id: 'ci-2', text: 'Rain for the farms, and rest for the farmers.' },
];
const calls = [];
let handed = false;

createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let json = null;
    try {
      json = body ? JSON.parse(body) : null;
    } catch {
      json = body;
    }
    calls.push({ method: req.method, path: url.pathname, key: req.headers['x-station-key'] ?? null, body: json });
    writeFileSync(file, JSON.stringify(calls, null, 1));
    const send = (status, out) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(out === undefined ? undefined : JSON.stringify(out));
    };
    // The health check (health.ts) asks without a key.
    if (url.pathname === '/health') return send(200, { ok: true });
    if (req.headers['x-station-key'] !== 'ci-station-key') return send(401, { message: 'bad key' });
    if (url.pathname === '/station/claim-batch') {
      if (handed) return send(204);
      handed = true;
      return send(200, { radioPrayers: PRAYERS });
    }
    if (url.pathname === '/station/claim' || url.pathname === '/station/setup-test' || url.pathname === '/station/sky') return send(204);
    if (url.pathname.startsWith('/station/')) return send(200, {});
    send(404, { message: 'not found' });
  });
}).listen(Number(port), '127.0.0.1', () => console.log(`mock API on 127.0.0.1:${port}, log ${file}`));
