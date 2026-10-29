// What the station reports to Prayer Tower about once a minute (POST /station/status),
// for the health alerts in Admin → Radio: is there a sound card to play bursts
// through, and is the radio answering and unkeyed. Names match the server's
// alerts (apps/server/src/modules/radio/health.ts): "audio" and "rig".
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
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

/**
 * macOS: Core Audio's devices, from `system_profiler SPAudioDataType -json`.
 * Fails only when no device is listed at all (the USB interface is unplugged and
 * no built-in output exists); names the output devices when the listing marks them.
 */
export async function macAudioCheck(run: () => Promise<string> = async () => (await promisify(execFile)('system_profiler', ['SPAudioDataType', '-json'], { timeout: 20_000 })).stdout): Promise<StatusCheck> {
  try {
    const json = JSON.parse(await run()) as { SPAudioDataType?: { _items?: Record<string, unknown>[] }[] };
    const devices = (json.SPAudioDataType ?? []).flatMap((g) => g._items ?? []);
    if (!devices.length) return { name: 'audio', ok: false, detail: 'No sound device found (is the USB interface plugged in?)' };
    const isOutput = (d: Record<string, unknown>) => Object.entries(d).some(([k, v]) => /output/i.test(k) && (typeof v === 'number' ? v > 0 : /yes|^\d*[1-9]/i.test(String(v))));
    const named = (devices.some(isOutput) ? devices.filter(isOutput) : devices).map((d) => String(d._name ?? '?'));
    return { name: 'audio', ok: true, detail: named.join('; ').slice(0, 300) };
  } catch (err) {
    return { name: 'audio', ok: false, detail: `Could not list sound devices: ${(err as Error).message.slice(0, 200)}` };
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
  if (o.audio) checks.push(process.platform === 'darwin' && !o.cardsFile ? await macAudioCheck() : await audioCheck(o.cardsFile));
  if (o.rig) checks.push(await rigCheck(o.rig));
  return checks;
}
