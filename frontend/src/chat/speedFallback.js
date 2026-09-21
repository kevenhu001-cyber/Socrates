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

var toolsNotified = false;

/* The provider accepted the request only after the tools field was
   stripped — this answer can contain no real tool calls, so say so
   instead of letting the model's prose imitate one. */
export function notifyToolsFallbackOnce() {
  if (toolsNotified) return;
  toolsNotified = true;
  showToast(_t("toast.toolsFallback", "This model's API doesn't support native tool calls — answered in text only"));
}

export function resetSpeedFallbackNoticeForTest() {
  notified = false;
  toolsNotified = false;
}
