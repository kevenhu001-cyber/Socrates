import { showToast } from '../ui/toast.js';

var notified = false;

function _t(key, fallback) {
  if (typeof window !== "undefined" && typeof window.t === "function") {
    var s = window.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

export function notifySpeedFallbackOnce() {
  if (notified) return;
  notified = true;
  showToast(_t("toast.speedFallback", "This model doesn't support fast mode — used standard speed"));
}

export function resetSpeedFallbackNoticeForTest() {
  notified = false;
}
