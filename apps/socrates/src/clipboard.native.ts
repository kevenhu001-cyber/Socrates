import * as Clipboard from 'expo-clipboard';
export async function copyText(text: string): Promise<void> {
  if (!await Clipboard.setStringAsync(text)) throw new Error('Copy failed');
}
