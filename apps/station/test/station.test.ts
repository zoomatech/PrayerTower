// Acceptance tests from the Queue-to-PSK31 build paper, against a mock fldigi.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fldigiClient } from '../src/fldigi.js';
import { DEFAULT_BLOCKLIST, foldAscii, passesFilter, splitPieces } from '../src/text.js';
import { runOnce, TransmitError, type StationApi } from '../src/worker.js';
import { decodeResponse, encodeCall } from '../src/xmlrpc.js';
import { startMockFldigi, type MockFldigi } from './mock-fldigi.js';

const cfg = { callSign: 'N0CALL', modem: 'BPSK31', maxPieceChars: 60, txTimeoutMs: 2000, blocklist: DEFAULT_BLOCKLIST };
const quiet = () => undefined;

function fakeApi(queue: { id: string; text: string }[]) {
  const reports: { id: string; ok: boolean; pieces?: number; error?: string }[] = [];
  const api: StationApi = {
    claim: async () => queue.shift() ?? null,
    report: async (id, r) => void reports.push({ id, ...r }),
  };
  return { api, reports };
}

let mock: MockFldigi;
beforeAll(async () => (mock = await startMockFldigi()));
afterAll(() => mock.close());
beforeEach(() => {
  mock.calls = [];
  mock.txPolls = 2;
});
const fldigi = () => fldigiClient(mock.url, { pollMs: 10 });
const added = () => mock.calls.filter((c) => c.method === 'text.add_tx').map((c) => c.params[0]);

describe('station worker (build paper acceptance tests)', () => {
  it('never passes a blocklisted message to text.add_tx', async () => {
    const { api, reports } = fakeApi([{ id: 'a', text: 'Pray for this shit to end' }]);
    expect(await runOnce(api, fldigi(), cfg, quiet)).toBe('rejected');
    expect(added()).toEqual([]);
    expect(mock.calls.some((c) => c.method === 'main.tx')).toBe(false);
    expect(reports).toEqual([{ id: 'a', ok: false, callSign: 'N0CALL', error: 'rejected by station content filter' }]);
  });

  it('sends "Señor Núñez" as "Senor Nunez" followed by the call sign', async () => {
    const { api, reports } = fakeApi([{ id: 'b', text: 'Señor Núñez' }]);
    expect(await runOnce(api, fldigi(), cfg, quiet)).toBe('sent');
    expect(added()).toEqual(['Senor Nunez de N0CALL ^r']);
    expect(reports).toEqual([{ id: 'b', ok: true, callSign: 'N0CALL', pieces: 1 }]);
  });

  it('calls main.rx_only and fails within TX_TIMEOUT when fldigi never returns to receive', async () => {
    mock.txPolls = Infinity;
    const { api, reports } = fakeApi([{ id: 'c', text: 'Pray for the station.' }]);
    const started = Date.now();
    await expect(runOnce(api, fldigi(), { ...cfg, txTimeoutMs: 300 }, quiet)).rejects.toBeInstanceOf(TransmitError);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(mock.calls.some((c) => c.method === 'main.rx_only')).toBe(true);
    expect(reports[0]).toMatchObject({ id: 'c', ok: false, error: 'transmit timed out' });
  });

  it('splits a message over the length cap, and every piece ends with the call sign', async () => {
    const text = 'Lord, we lift up every family in our town who is waiting for news from the hospital tonight, and ask for your peace.';
    const { api, reports } = fakeApi([{ id: 'd', text }]);
    await runOnce(api, fldigi(), cfg, quiet);
    const sent = added();
    expect(sent.length).toBeGreaterThan(1);
    for (const piece of sent) {
      expect(piece).toMatch(/ de N0CALL \^r$/);
      expect(piece!.replace(/ de N0CALL \^r$/, '').length).toBeLessThanOrEqual(60);
    }
    expect(sent.map((p) => p!.replace(/ de N0CALL \^r$/, '')).join(' ')).toBe(text);
    expect(reports[0]).toMatchObject({ ok: true, pieces: sent.length });
  });

  it('never transmits when the queue is empty', async () => {
    const { api } = fakeApi([]);
    expect(await runOnce(api, fldigi(), cfg, quiet)).toBe('idle');
    expect(mock.calls).toEqual([]);
  });
});

describe('text and XML-RPC helpers', () => {
  it('folds curly quotes, dashes and emoji to ASCII', () => {
    expect(foldAscii('mañana 🙏 ¡sí!')).toBe('manana si!');
    expect(foldAscii('“Dios” — mañana')).toBe('"Dios" - manana');
  });

  it('filters whole words with common endings, not innocent words', () => {
    expect(passesFilter('Pray for Dickens and Scunthorpe', DEFAULT_BLOCKLIST)).toBe(true);
    expect(passesFilter('those bastards', DEFAULT_BLOCKLIST)).toBe(false);
    expect(passesFilter('¡Mierda!', DEFAULT_BLOCKLIST)).toBe(false);
  });

  it('keeps a long single word within the cap', () => {
    expect(splitPieces('a'.repeat(25), 10, 'N0CALL')).toEqual(['aaaaaaaaaa de N0CALL', 'aaaaaaaaaa de N0CALL', 'aaaaa de N0CALL']);
  });

  it('encodes calls and decodes values and faults', () => {
    expect(encodeCall('text.add_tx', ['a<b & c'])).toContain('<string>a&lt;b &amp; c</string>');
    expect(decodeResponse('<methodResponse><params><param><value><string>rx</string></value></param></params></methodResponse>')).toBe('rx');
    expect(decodeResponse('<methodResponse><params><param><value><i4>7</i4></value></param></params></methodResponse>')).toBe(7);
    expect(() =>
      decodeResponse('<methodResponse><fault><value><struct><member><name>faultString</name><value><string>no such method</string></value></member></struct></value></fault></methodResponse>'),
    ).toThrow('no such method');
  });
});
