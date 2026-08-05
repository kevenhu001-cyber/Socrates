/**
 * P_canvas-mode — write-to-clipboard helper used by CanvasBlock's Copy
 * and Iterate actions. Tries navigator.clipboard first, falls back to a
 * hidden textarea + execCommand("copy") for older browsers / restricted
 * contexts (the same pattern used by useMessageActions.ts).
 */

export function copyToClipboard(text: string): boolean {
  if (typeof text !== 'string' || !text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return true;
    }
  } catch (_) {}
  fallbackCopy(text);
  return true;
}

function fallbackCopy(text: string): void {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch (_) {}
    document.body.removeChild(ta);
  } catch (_) {}
}