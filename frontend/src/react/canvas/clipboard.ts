
import { reportSwallow } from '../../util/reportSwallow.ts';
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
  } catch (error) { reportSwallow(error, 'react/canvas/clipboard.ts:15', 'expected'); }
  fallbackCopy(text);
  return true;
}

function fallbackCopy(text: string): void {
  void import('../legacy-controls/clipboardTextarea').then(({ copyTextWithShadcnTextarea }) => copyTextWithShadcnTextarea(text))
    .catch((error) => reportSwallow(error, 'react/canvas/clipboard.ts:26', 'expected'));
}
