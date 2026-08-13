export async function registerPushNotifications() {
  return false;
}

export async function unregisterPushNotifications() {
  return undefined;
}

export function subscribeToNotificationNavigation(_onSession: (sessionId: string) => void) {
  return () => undefined;
}
