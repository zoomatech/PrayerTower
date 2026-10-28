// A mock fldigi XML-RPC server for tests: records every call and reports
// transmit for `txPolls` status polls before returning to receive.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface MockFldigi {
  url: string;
  calls: { method: string; params: string[] }[];
  /** Status polls that report "tx" after main.tx; Infinity = never returns to receive. */
  txPolls: number;
  close(): Promise<void>;
}

export async function startMockFldigi(): Promise<MockFldigi> {
  let remaining = 0;
  const mock: MockFldigi = { url: '', calls: [], txPolls: 2, close: async () => undefined };
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const method = /<methodName>(.*?)<\/methodName>/.exec(body)?.[1] ?? '';
      const params = [...body.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
      mock.calls.push({ method, params });
      let value = '<string></string>';
      if (method === 'main.tx') remaining = mock.txPolls;
      if (method === 'main.rx_only') remaining = 0;
      if (method === 'main.get_trx_status') {
        value = remaining > 0 ? '<string>tx</string>' : '<string>rx</string>';
        remaining--;
      }
      res.writeHead(200, { 'content-type': 'text/xml' });
      res.end(`<?xml version="1.0"?><methodResponse><params><param><value>${value}</value></param></params></methodResponse>`);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/RPC2`;
  mock.close = () => new Promise((r) => server.close(() => r()));
  return mock;
}
