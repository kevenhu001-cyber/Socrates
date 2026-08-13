/** Browser builds do not register device push tokens. Keep this module free of
    expo-notifications imports so Expo Web has no native listener side effects. */
export async function registerPushNotifications() {
  return false;
}

export async function unregisterPushNotifications() {
  return undefined;
}

export function subscribeToNotificationNavigation(_onSession: (sessionId: string) => void) {
  return () => undefined;
}
