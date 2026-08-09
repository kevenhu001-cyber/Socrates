import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { notificationsApi } from '../data/api/client';
import { readDeviceId } from '../data/api/tokenStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registeredToken: string | null = null;

export async function registerPushNotifications() {
  if (Platform.OS !== 'android') return false;

  const current = await Notifications.getPermissionsAsync();
  const permissions = current.granted
    ? current
    : await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return false;

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  const token = typeof deviceToken.data === 'string' ? deviceToken.data : String(deviceToken.data);
  if (token.length < 10 || token === registeredToken) return false;

  await notificationsApi.register(token, await readDeviceId());
  registeredToken = token;
  return true;
}

export async function unregisterPushNotifications() {
  if (!registeredToken) return;
  try { await notificationsApi.unregister(); } finally { registeredToken = null; }
}

export function subscribeToNotificationNavigation(onSession: (sessionId: string) => void) {
  const handle = (response: Notifications.NotificationResponse | null) => {
    const data = response?.notification.request.content.data as { sessionId?: unknown } | undefined;
    if (typeof data?.sessionId === 'string' && data.sessionId) onSession(data.sessionId);
  };
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handle(response);
  });
  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
  return () => subscription.remove();
}
