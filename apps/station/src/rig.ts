// Radio control through Hamlib's rigctld (docs/STATION_OPERATOR_GUIDE.md, "Rig control").
// rigctld runs beside the worker (prayer-tower-rigctld.service) and speaks a
// line protocol on TCP port 4532. Every command here uses the Extended Response
// Protocol ("+" prefix), so each answer is "Key: value" lines ending in
// "RPRT <code>", where 0 is success and a negative number is a Hamlib error.
// Commands: F/f frequency in Hz, M/m mode and passband, T/t PTT (0 receive, 1 transmit).
import { connect } from 'node:net';

export interface Rig {
  setFrequency(hz: number): Promise<void>;
  frequency(): Promise<number>;
  /** Hamlib mode token (USB, PKTUSB, FM, PKTFM...) and passband in Hz (0 is the radio's default). */
  setMode(mode: string, passbandHz: number): Promise<void>;
  setPtt(on: boolean): Promise<void>;
  ptt(): Promise<boolean>;
}

export class RigError extends Error {}

/** Hamlib mode tokens rigctld accepts (rigctld(1), set_mode). */
export const RIG_MODES = ['USB', 'LSB', 'CW', 'CWR', 'RTTY', 'RTTYR', 'AM', 'FM', 'WFM', 'AMS', 'PKTLSB', 'PKTUSB', 'PKTFM', 'ECSSUSB', 'ECSSLSB', 'FA', 'SAM', 'SAL', 'SAH', 'DSB'] as const;

/** Send one command and collect its "Key: value" lines; rejects on a non-zero RPRT, a dropped connection or a timeout. */
export function rigctldCommand(host: string, port: number, command: string, timeoutMs = 5_000, daemon = 'rigctld'): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    let buf = '';
    const fail = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs, () => fail(new RigError(`${daemon} at ${host}:${port} did not answer "${command}"`)));
    socket.on('error', (err) => fail(new RigError(`${daemon} at ${host}:${port}: ${err.message}`)));
    socket.on('connect', () => socket.write(`+${command}\n`));
    socket.on('data', (d) => {
      buf += d.toString('latin1');
      const m = /^RPRT (-?\d+)\s*$/m.exec(buf);
      if (!m) return;
      socket.end();
      const code = Number(m[1]);
      if (code !== 0) return reject(new RigError(`${daemon} refused "${command}" (Hamlib error ${code})`));
      const values: Record<string, string> = {};
      for (const line of buf.slice(0, m.index).split('\n')) {
        const kv = /^([^:]+):\s*(.*)$/.exec(line.trim());
        if (kv) values[kv[1]!] = kv[2]!;
      }
      resolve(values);
    });
  });
}

export function rigctldClient(host = '127.0.0.1', port = 4532, timeoutMs = 5_000): Rig {
  const cmd = (c: string) => rigctldCommand(host, port, c, timeoutMs);
  return {
    async setFrequency(hz) {
      await cmd(`F ${Math.round(hz)}`);
    },
    async frequency() {
      return Number((await cmd('f'))['Frequency']);
    },
    async setMode(mode, passbandHz) {
      await cmd(`M ${mode} ${Math.round(passbandHz)}`);
    },
    async setPtt(on) {
      await cmd(`T ${on ? 1 : 0}`);
    },
    async ptt() {
      return (await cmd('t'))['PTT'] === '1';
    },
  };
}

export interface RigSetup {
  frequencyHz?: number;
  mode?: string;
  passbandHz: number;
}

/** Tune before the first transmission. Anything left unset stays as the operator left the radio. */
export async function tuneRig(rig: Rig, s: RigSetup, log: (m: string) => void = console.log) {
  if (s.frequencyHz) await rig.setFrequency(s.frequencyHz);
  if (s.mode) await rig.setMode(s.mode, s.passbandHz);
  log(`[rig] tuned${s.frequencyHz ? ` to ${(s.frequencyHz / 1e6).toFixed(6)} MHz` : ''}${s.mode ? ` ${s.mode}` : ''}`);
}

/** Key the transmitter and read PTT back, so a radio that ignored the command is caught before any audio plays. */
export async function keyRig(rig: Rig, on: boolean) {
  await rig.setPtt(on);
  if ((await rig.ptt()) !== on) throw new RigError(`PTT did not ${on ? 'key' : 'unkey'}: the radio reports ${on ? 'receive' : 'transmit'}`);
}
