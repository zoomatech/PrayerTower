// fldigi over its local XML-RPC server (default 127.0.0.1:7362). fldigi does
// the PSK31 encoding and tone generation; this only loads text and keys it.
// Methods: modem.set_by_name, text.add_tx, main.tx, main.get_trx_status, main.rx_only.
import { XmlRpcClient } from './xmlrpc.js';

export interface Fldigi {
  setModem(name: string): Promise<void>;
  /** Send one piece and wait until fldigi is back in receive; on timeout, disable transmit and throw. */
  transmit(text: string, timeoutMs: number): Promise<void>;
  /** Stop transmitting now. */
  rxOnly(): Promise<void>;
}

export function fldigiClient(url: string, opts: { pollMs?: number; fetchImpl?: typeof fetch } = {}): Fldigi {
  const rpc = new XmlRpcClient(url, opts.fetchImpl);
  const pollMs = opts.pollMs ?? 1000;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const rxOnly = async () => {
    await rpc.call('main.rx_only');
  };

  return {
    async setModem(name) {
      await rpc.call('modem.set_by_name', name);
    },
    rxOnly,
    async transmit(text, timeoutMs) {
      // ^r tells fldigi to return to receive when the text has been sent.
      await rpc.call('text.add_tx', `${text} ^r`);
      await rpc.call('main.tx');
      // Wait to see fldigi go into transmit, then back to receive. A status
      // read before the switch would otherwise look like an instant finish.
      const deadline = Date.now() + timeoutMs;
      let sawTx = false;
      while (Date.now() < deadline) {
        const receiving = String((await rpc.call('main.get_trx_status')) ?? '').toLowerCase().startsWith('rx');
        if (!receiving) sawTx = true;
        else if (sawTx) return;
        await sleep(pollMs);
      }
      await rxOnly();
      throw new Error(sawTx ? 'transmit timed out' : 'fldigi never started transmitting');
    },
  };
}
