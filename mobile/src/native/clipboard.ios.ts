import * as Clipboard from 'expo-clipboard';

export async function setClipboardText(value: string) {
  await Clipboard.setStringAsync(value);
}
