// "I'm praying too" from the Listen screen (docs/RADIO_BURST.md). A tap is
// saved on the phone first and sent when the phone is online: just the
// station's call sign and the prayer's fingerprint, never the words or who
// tapped. The server only keeps an anonymous count.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '@/lib/api';

const QUEUE = 'praying-too:queue:v1';
const TAPPED = 'praying-too:tapped:v1';

type Tap = { callSign: string; hash: string };

async function read<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
const write = (key: string, v: unknown[]) => AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => undefined);

/** Fingerprints this phone already tapped (so the button shows it once). */
export async function tappedHashes(): Promise<Set<string>> {
  return new Set(await read<string>(TAPPED));
}

/** Send what is waiting; taps that can't be sent now (offline) stay for next time. Returns how many were sent. */
export async function flushPraying(): Promise<number> {
  const queue = await read<Tap>(QUEUE);
  if (!queue.length) return 0;
  const left: Tap[] = [];
  let sent = 0;
  for (const callSign of new Set(queue.map((t) => t.callSign))) {
    const taps = queue.filter((t) => t.callSign === callSign);
    for (let i = 0; i < taps.length; i += 50) {
      const chunk = taps.slice(i, i + 50);
      try {
        await api.listenPraying({ callSign, hashes: chunk.map((t) => t.hash) });
        sent += chunk.length;
      } catch {
        left.push(...chunk);
      }
    }
  }
  await write(QUEUE, left);
  return sent;
}

/** Record a tap and try to send it. */
export async function tapPraying(tap: Tap): Promise<void> {
  const tapped = await read<string>(TAPPED);
  if (tapped.includes(tap.hash)) return;
  await write(TAPPED, [tap.hash, ...tapped].slice(0, 500));
  await write(QUEUE, [...(await read<Tap>(QUEUE)), tap].slice(-500));
  await flushPraying();
}
