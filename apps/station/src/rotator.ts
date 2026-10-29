// Dish rotator (docs/STATION_OPERATOR_GUIDE.md, "Dish and sky target"), off
// unless ROTATOR=rotctld. Prayer Tower works out where the sky target is
// (GET /station/sky); about once a minute the station asks and, when the
// target has moved more than ROTATOR_STEP_DEG, turns the rotator there through
// Hamlib's rotctld ("P <az> <el>", rotctld(1), default port 4533). Below the
// horizon it waits at elevation 0 on the target's bearing.
import { rigctldCommand } from './rig.js';

export interface Pointing {
  az: number;
  el: number;
}

export interface Rotator {
  point(p: Pointing): Promise<void>;
  position(): Promise<Pointing>;
}

export function rotctldClient(host = '127.0.0.1', port = 4533, timeoutMs = 5_000): Rotator {
  const cmd = (c: string) => rigctldCommand(host, port, c, timeoutMs, 'rotctld');
  return {
    async point(p) {
      await cmd(`P ${p.az.toFixed(1)} ${p.el.toFixed(1)}`);
    },
    async position() {
      const r = await cmd('p');
      return { az: Number(r['Azimuth']), el: Number(r['Elevation']) };
    },
  };
}

/** The shorter way round between two bearings, in degrees. */
const azDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export class DishFollower {
  private last: Pointing | null = null;
  private lastAt = -Infinity;
  lastError: string | null = null;

  constructor(
    private rotator: Rotator,
    private fetchTarget: () => Promise<Pointing | null>,
    private opts: { stepDeg: number; everyMs: number; minEl?: number; maxEl?: number },
    private now: () => number = Date.now,
  ) {}

  /** Ask where to point and turn if needed; returns where it turned to, or null when it stayed. */
  async tick(): Promise<Pointing | null> {
    if (this.now() - this.lastAt < this.opts.everyMs) return null;
    this.lastAt = this.now();
    try {
      const t = await this.fetchTarget();
      if (!t) return null;
      const want = { az: t.az, el: Math.min(this.opts.maxEl ?? 90, Math.max(this.opts.minEl ?? 0, t.el)) };
      if (this.last && azDiff(this.last.az, want.az) < this.opts.stepDeg && Math.abs(this.last.el - want.el) < this.opts.stepDeg) return null;
      await this.rotator.point(want);
      this.last = want;
      this.lastError = null;
      return want;
    } catch (err) {
      this.lastError = (err as Error).message;
      return null;
    }
  }

  /** For the station's status report (Admin → Radio health, operator console). */
  statusDetail(): string {
    return this.lastError ?? (this.last ? `pointed az=${this.last.az.toFixed(1)} el=${this.last.el.toFixed(1)}` : 'waiting for a target');
  }
}
