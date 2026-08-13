import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { getPreferences } from '../data/preferences';

export interface NativeFileAsset {
  uri: string;
  name?: string;
  fileName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  fileSize?: number | null;
  base64?: string | null;
}

export interface NativePickerResult {
  canceled: boolean;
  assets: NativeFileAsset[];
}

export const native = {
  async vibrate(kind: 'light' | 'success' | 'error' = 'light') {
    // Respects the Haptics switch in Settings.
    if (!getPreferences().haptics) return undefined;
    if (kind === 'success') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (kind === 'error') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  async openBrowser(url: string) {
    return WebBrowser.openBrowserAsync(url);
  },
  async openOAuth(url: string, redirectUrl: string) {
    return WebBrowser.openAuthSessionAsync(url, redirectUrl);
  },
  async share(url: string) {
    if (await Sharing.isAvailableAsync()) return Sharing.shareAsync(url);
    return undefined;
  },
  async pickFile(): Promise<NativePickerResult> {
    return DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false }) as Promise<NativePickerResult>;
  },
  async pickImage(): Promise<NativePickerResult> {
    return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, base64: true, allowsEditing: false }) as Promise<NativePickerResult>;
  },
  async capturePhoto(): Promise<NativePickerResult> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { canceled: true, assets: [] };
    return ImagePicker.launchCameraAsync({ quality: 0.75, base64: true, allowsEditing: false }) as Promise<NativePickerResult>;
  },
};
