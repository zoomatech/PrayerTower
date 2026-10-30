// The prayer panel (docs/RADIO_BURST.md, "Prayer panel"), off until an admin turns on
// radio_panel_enabled. A station in BURST_MODE=sstv claims prayers and sends them as a panel
// picture in SSTV; members can show or print the latest prayers as a panel (the app draws it
// from these words); the listener apps read panels with the camera or from SSTV audio.
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import * as radio from './index.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select radio_panel_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set radio_panel_enabled = $1', [on]);
}

/** The latest prayers that went out, newest first, as the cast log shows them: the words for a panel. */
export async function latest(q: Queryable, viewerId: string) {
  if (!(await enabled(q))) throw notFound('Prayer panel');
  const { cast } = await radio.castLog(q, viewerId, 30);
  return { callSign: cast.find((c) => c.call_sign)?.call_sign ?? 'N0CALL', prayers: cast.map((c) => c.text), at: cast[0]?.transmitted_at ?? null };
}
