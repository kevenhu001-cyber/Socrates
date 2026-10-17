import { showToast } from '../ui/toast.js';

/* Tutor/Socratic turns fall back to canned strings from `chat/mocks.js`
   when no usable model is configured (or a turn returns nothing). Those
   strings read like real AI replies, so the user has no way to tell that
   no model answered. This notifies once per session, mirroring
   `speedFallback.ts`, so the degradation is visible without nagging on
   every turn. */

let notified = false;

function _t(key: string, fallback: string): string {
  if (typeof window !== 'undefined' && typeof window.t === 'function') {
    const s = window.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

export function notifyMockFallbackOnce(): void {
  if (notified) return;
  notified = true;
  showToast(_t('toast.mockFallback',
    'No model is configured — showing sample prompts instead of AI replies. Add a model in Settings.'));
}

export function resetMockFallbackNoticeForTest(): void {
  notified = false;
}
