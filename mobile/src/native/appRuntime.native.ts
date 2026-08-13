import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';

export async function prepareAppRuntime() {
  await SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

export async function setAppBackgroundColor(color: string) {
  await SystemUI.setBackgroundColorAsync(color).catch(() => undefined);
}

export async function hideAppSplash() {
  await SplashScreen.hideAsync().catch(() => undefined);
}
