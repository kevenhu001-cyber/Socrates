import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';

export async function prepareAppRuntime() {
  try {
    await SplashScreen.preventAutoHideAsync();
  } catch (error) {
    console.warn('[AppRuntime] Failed to prevent splash auto-hide:', error);
  }
}

export async function setAppBackgroundColor(color: string) {
  try {
    await SystemUI.setBackgroundColorAsync(color);
  } catch (error) {
    console.warn('[AppRuntime] Failed to set background color:', error);
  }
}

export async function hideAppSplash() {
  try {
    await SplashScreen.hideAsync();
  } catch (error) {
    console.warn('[AppRuntime] Failed to hide splash screen:', error);
  }
}
