/** Clipboard write with the shadcn textarea fallback (denied permission,
 * insecure context). Restores focus to whatever held it before. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const focused = document.activeElement;
    try {
      const { copyTextWithShadcnTextarea } = await import('../legacy-controls/clipboardTextarea');
      await copyTextWithShadcnTextarea(text);
      return true;
    } catch (_) {
      // Clipboard denial is recoverable; the caller shows 「复制失败」.
      return false;
    } finally {
      if (focused instanceof window.HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    }
  }
}

/** Open a source in a new tab without handing it the opener. */
export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
