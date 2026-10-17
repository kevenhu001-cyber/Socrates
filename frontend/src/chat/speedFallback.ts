import { showToast } from '../ui/toast.js';

let notified = false;

function _t(key: string, fallback: string): string {
  if (typeof window !== 'undefined' && typeof window.t === 'function') {
    const s = window.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

export function notifySpeedFallbackOnce(): void {
  if (notified) return;
  notified = true;
  showToast(_t('toast.speedFallback', "This model doesn't support fast mode — used standard speed"));
}

export function resetSpeedFallbackNoticeForTest(): void {
  notified = false;
}
