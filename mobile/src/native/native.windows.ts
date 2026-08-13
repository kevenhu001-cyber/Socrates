import { Linking } from 'react-native';
import { getPreferences } from '../data/preferences';
import type { NativePickerResult } from './native';

/**
 * Windows adapter boundary. The desktop shell can replace these implementations
 * with WinAppSDK modules without changing screens or stores. Keep the fallback
 * conservative: browser URLs work, while unsupported mobile-only actions are
 * reported as cancelled instead of crashing the desktop bundle.
 */
export const native = {
  async vibrate(_kind: 'light' | 'success' | 'error' = 'light') {
    if (!getPreferences().haptics) return undefined;
    return undefined;
  },
  async openBrowser(url: string) {
    return Linking.openURL(url);
  },
  async openOAuth(url: string, _redirectUrl: string) {
    return Linking.openURL(url);
  },
  async share(url: string) {
    return Linking.openURL(url);
  },
  async pickFile(): Promise<NativePickerResult> {
    return { canceled: true, assets: [] };
  },
  async pickImage(): Promise<NativePickerResult> {
    return { canceled: true, assets: [] };
  },
  async capturePhoto(): Promise<NativePickerResult> {
    return { canceled: true, assets: [] };
  },
};
