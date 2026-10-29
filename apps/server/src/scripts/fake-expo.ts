// A stand-in for Expo's push service, to try push delivery without phones or
// Apple and Google keys:
//   npm run fake-expo                       listen on 127.0.0.1:4010
//   FAKE_EXPO_MODE=busy npm run fake-expo   answer 503 (the server retries later)
//   FAKE_EXPO_MODE=dead npm run fake-expo   every device is DeviceNotRegistered
// Then run the API and worker with EXPO_PUSH_BASE_URL=http://127.0.0.1:4010 and
// turn on Admin → Push delivery. Each push is printed; receipts come back "ok".
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_EXPO_PORT ?? 4010);
const mode = process.env.FAKE_EXPO_MODE ?? 'ok';
let next = 1;

createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const reply = (status: number, json: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    if (req.url === '/--/api/v2/push/send') {
      if (mode === 'busy') return reply(503, { errors: [{ code: 'SERVICE_UNAVAILABLE' }] });
      const messages = (Array.isArray(body) ? body : [body]) as { to: string; title: string; body: string; collapseId?: string }[];
      for (const m of messages) console.log(`push → ${oneLine(m.to)}: ${oneLine(m.title)} — ${oneLine(m.body)}${m.collapseId ? ` (collapseId ${oneLine(m.collapseId)})` : ''}`);
      return reply(200, {
        data: messages.map(() => (mode === 'dead' ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `fake-${next++}` })),
      });
    }
    if (req.url === '/--/api/v2/push/getReceipts') {
      const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
      console.log(`receipts for ${Number(ids.length)} push(es)`);
      return reply(200, { data: Object.fromEntries(ids.map((id) => [id, { status: 'ok' }])) });
    }
    reply(404, { errors: [{ code: 'NOT_FOUND' }] });
  });
}).listen(port, '127.0.0.1', () => console.log(`fake Expo on http://127.0.0.1:${port} (${mode})`));

/** Line breaks out, so a request can't write fake lines into this log. */
function oneLine(v: unknown) {
  return String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ');
}
