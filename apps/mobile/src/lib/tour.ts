// Whether the first-run tour (app/tour.tsx) has been seen, per member, on this device.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const seenKey = (userId: string) => `tour:seen:v1:${userId}`;

/** Whether this member has finished or skipped the tour on this device. */
export async function tourSeen(userId: string) {
  try {
    return (await AsyncStorage.getItem(seenKey(userId))) === '1';
  } catch {
    return true; // No storage: don't keep showing it.
  }
}

export async function markTourSeen(userId: string) {
  try {
    await AsyncStorage.setItem(seenKey(userId), '1');
  } catch {
    // Shown again next time; harmless.
  }
}
