// Starts and ends the "Praying for you now" Live Activity (src/widgets/prayed-for-live.tsx).
// iOS only; elsewhere these do nothing. The server keeps each activity's push token and
// sends Apple an update when someone prays (modules/live-activity on the server).
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { api } from '@/lib/api';
import type { PrayedForProps } from '@/widgets/prayed-for-live';

type Activity = {
  getId(): string;
  update(props: PrayedForProps): Promise<void>;
  end(dismissalPolicy?: 'default' | 'immediate'): Promise<void>;
  getPushToken(): Promise<string | null>;
  addPushTokenListener(listener: (e: { pushToken: string }) => void): { remove(): void };
};
type Factory = { start(props: PrayedForProps, url?: string): Activity; getInstances(): Activity[] };

// Loaded lazily so the web, Jest and Expo Go never touch the native module.
function factory(): Factory | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('@/widgets/prayed-for-live').default as Factory;
  } catch {
    return null;
  }
}

export const liveSupported = () => factory() !== null;

const KEY = 'live-activity:v1';
async function map(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
async function remember(postId: string, activityId: string | null) {
  const m = await map();
  if (activityId) m[postId] = activityId;
  else delete m[postId];
  await AsyncStorage.setItem(KEY, JSON.stringify(m)).catch(() => undefined);
}

/** The running activity for this request, if any. */
export async function liveFor(postId: string): Promise<Activity | null> {
  const f = factory();
  if (!f) return null;
  const id = (await map())[postId];
  return (id && f.getInstances().find((a) => a.getId() === id)) || null;
}

const appId = () => Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.zoomatech.prayertower';

/** Put this request on the Lock Screen; the server learns the push token as soon as iOS gives it. */
export async function startLive(postId: string, initial: PrayedForProps): Promise<boolean> {
  const f = factory();
  if (!f) return false;
  const activity = f.start(initial, Linking.createURL(`/post/${postId}`));
  await remember(postId, activity.getId());
  const register = async (pushToken: string) => {
    const r = await api.startLiveActivity({ postId, pushToken, appId: appId() });
    await activity.update(r.props);
  };
  activity.addPushTokenListener((e) => void register(e.pushToken).catch(() => undefined));
  const token = await activity.getPushToken();
  if (token) await register(token);
  return true;
}

/** Take it off the Lock Screen. */
export async function endLive(postId: string) {
  const activity = await liveFor(postId);
  if (!activity) return;
  const token = await activity.getPushToken().catch(() => null);
  await activity.end('immediate');
  await remember(postId, null);
  if (token) await api.endLiveActivity(token).catch(() => undefined);
}
