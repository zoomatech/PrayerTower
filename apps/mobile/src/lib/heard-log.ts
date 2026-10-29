// Prayers heard on air: what this phone's Listen screen decoded, kept on the
// phone only (never sent anywhere), newest first, at most MAX entries.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'heard-on-air:v1';
export const MAX = 200;

export interface HeardPrayer {
  text: string;
  callSign: string;
  /** ISO time it was decoded. */
  at: string;
}

export async function loadHeard(): Promise<HeardPrayer[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as HeardPrayer[]).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Add newly decoded prayers to the front; returns the saved list. Saving errors are ignored (it is only a convenience). */
export async function addHeard(prayers: HeardPrayer[]): Promise<HeardPrayer[]> {
  const list = [...prayers, ...(await loadHeard())].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
  return list;
}

export async function clearHeard() {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}
