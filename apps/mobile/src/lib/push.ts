// Push notifications: register this device's Expo push token with the API and
// open the request a notification is about when it is tapped. Remote push needs
// a development or store build on a physical device (not Expo Go on Android,
// not simulators, not web) and an EAS project ID.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function register(): Promise<void> {
  if (!supported || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    // Android 13+ shows the permission prompt only once a channel exists.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Prayer notices',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push is off: no EAS project ID in app config (run `eas init`).');
    return;
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.registerPushToken(token, Platform.OS);
}

function openFrom(response: Notifications.NotificationResponse | null) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const postId = response.notification.request.content.data?.postId;
  if (typeof postId === 'string') router.push(`/post/${postId}`);
}

/** Call once the member is signed in and onboarded. */
export function usePush(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !supported) return;
    register().catch((e) => console.warn('Push registration failed', e));
    openFrom(Notifications.getLastNotificationResponse());
    Notifications.clearLastNotificationResponse();
    const sub = Notifications.addNotificationResponseReceivedListener(openFrom);
    return () => sub.remove();
  }, [enabled]);
}
