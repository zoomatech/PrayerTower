// What the station reports to Prayer Tower about once a minute (POST /station/status),
// for the health alerts in Admin → Radio: is there a sound card to play bursts
// through, and is the radio answering and unkeyed. Names match the server's
// alerts (apps/server/src/modules/radio/health.ts): "audio" and "rig".
import { readFile } from 'node:fs/promises';
import type { Rig } from './rig.js';

export interface StatusCheck {
  name: 'audio' | 'rig';
  ok: boolean;
  detail: string;
}

/** ALSA's list of sound cards; "--- no soundcards ---" or a missing file means none. */
export async function audioCheck(cardsFile = '/proc/asound/cards'): Promise<StatusCheck> {
  try {
    const text = await readFile(cardsFile, 'utf8');
    const cards = [...text.matchAll(/^\s*\d+\s+\[[^\]]*\]:\s*(.+)$/gm)].map((m) => m[1]!.trim());
    return cards.length ? { name: 'audio', ok: true, detail: cards.join('; ').slice(0, 300) } : { name: 'audio', ok: false, detail: 'No sound card found (is the USB interface plugged in?)' };
  } catch {
    return { name: 'audio', ok: false, detail: `No sound card found (${cardsFile} is missing)` };
  }
}

export async function rigCheck(rig: Rig): Promise<StatusCheck> {
  try {
    if (await rig.ptt()) return { name: 'rig', ok: false, detail: 'The radio is transmitting between bursts (PTT stuck?)' };
    return { name: 'rig', ok: true, detail: `${((await rig.frequency()) / 1e6).toFixed(6)} MHz, receive` };
  } catch (err) {
    return { name: 'rig', ok: false, detail: (err as Error).message.slice(0, 300) };
  }
}

/** The checks that apply: audio only when bursts play through the sound card, rig only with RIG_CONTROL=rigctld. */
export async function stationChecks(o: { audio: boolean; rig?: Rig; cardsFile?: string }): Promise<StatusCheck[]> {
  const checks: StatusCheck[] = [];
  if (o.audio) checks.push(await audioCheck(o.cardsFile));
  if (o.rig) checks.push(await rigCheck(o.rig));
  return checks;
}
