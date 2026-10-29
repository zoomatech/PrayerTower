// A mock Hamlib rigctld for tests: answers F/f, M/m and T/t in the Extended
// Response Protocol (and rotctld's P/p) and records each command. `stuckPtt` makes the radio
// ignore T (as a radio with a bad CAT cable would); `noPttReport` answers t with Hamlib's
// "not available" (-11), as the dummy rig and VOX-keyed radios do.
import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';

export interface MockRig {
  port: number;
  commands: string[];
  state: { freq: number; mode: string; passband: number; ptt: number; az: number; el: number };
  stuckPtt: boolean;
  noPttReport: boolean;
  close(): Promise<void>;
}

export async function startMockRigctld(): Promise<MockRig> {
  const mock: MockRig = { port: 0, commands: [], state: { freq: 145_000_000, mode: 'FM', passband: 15_000, ptt: 0, az: 0, el: 0 }, stuckPtt: false, noPttReport: false, close: async () => undefined };
  const server: Server = createServer((sock) => {
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim().replace(/^\+/, '');
        buf = buf.slice(nl + 1);
        mock.commands.push(line);
        const [c, a, b] = line.split(/\s+/);
        const s = mock.state;
        let out = '';
        let code = 0;
        if (c === 'F') {
          s.freq = Number(a);
          out = `set_freq: ${a}\n`;
        } else if (c === 'f') out = `get_freq:\nFrequency: ${s.freq}\n`;
        else if (c === 'M') {
          if (!a || a === 'BOGUS') code = -1;
          else [s.mode, s.passband] = [a, Number(b)];
          out = `set_mode: ${a} ${b}\n`;
        } else if (c === 'm') out = `get_mode:\nMode: ${s.mode}\nPassband: ${s.passband}\n`;
        else if (c === 'T') {
          if (!mock.stuckPtt) s.ptt = Number(a);
          out = `set_ptt: ${a}\n`;
        } else if (c === 't') {
          if (mock.noPttReport) code = -11;
          else out = `get_ptt:\nPTT: ${s.ptt}\n`;
        }
        // rotctld's commands, so one mock serves as a rotator too.
        else if (c === 'P') {
          [s.az, s.el] = [Number(a), Number(b)];
          if (s.el > 90 || s.az < 0 || s.az > 360) code = -1;
          out = `set_pos: ${a} ${b}\n`;
        } else if (c === 'p') out = `get_pos:\nAzimuth: ${s.az}\nElevation: ${s.el}\n`;
        else code = -4;
        sock.write(`${out}RPRT ${code}\n`);
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  mock.port = (server.address() as AddressInfo).port;
  mock.close = () => new Promise((r) => server.close(() => r()));
  return mock;
}
