export async function copyText(_text: string): Promise<void> {
  throw new Error('Clipboard is unavailable on this platform');
}
