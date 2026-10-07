import { copyText } from './clipboard';

/* Sharing is optional per platform: the browser may expose navigator.share,
 * otherwise we fall back to the clipboard and tell the caller which happened. */

export async function shareText(title: string, content: string): Promise<'shared' | 'copied'> {
  const nav = globalThis.navigator as Navigator & { share?: (data: { title?: string; text?: string }) => Promise<void> };
  if (typeof nav.share === 'function') {
    await nav.share({ title, text: content });
    return 'shared';
  }
  await copyText(content);
  return 'copied';
}
