import { getStoredReasoningEffort } from '../config/chatPreferences.ts';
import { openChatConfiguration } from '../react/chat-configuration/chatConfiguration.bridge.ts';
/* ui/effortPicker.js — the composer "思考强度" pill.
 *
 * P_chatgpt-landing (v3). The pill is a fixed-label trigger (思考强度 ⌄)
 * that opens the anchored React generation-config popover
 * (react/chat-configuration) — model list plus reasoning-effort slider and
 * response speed, mirroring the ChatGPT mobile composer. The legacy
 * in-picker dropdown markup and its portalling machinery were removed; this
 * module now only owns the persisted effort value and the trigger's
 * aria/tooltip copy.
 *
 * Deep thinking is derived from reasoning effort: High turns on the verbose
 * "careful scholar" chat prompt via window.extensiveThinkingOn (read by
 * main.js when building the system prompt).
 *
 * Persistence: localStorage["socrates-reasoning-effort"] ∈ high|medium|low
 * (schema-validated by config/chatPreferences.ts).
 */

var VALID = ["high", "medium", "low"];
var _effort = null;

function _load() {
  var v = getStoredReasoningEffort();
  _effort = VALID.indexOf(v) >= 0 ? v : "medium";
  _syncThinking(_effort);
  return _effort;
}

function _syncThinking(v) {
  try { window.extensiveThinkingOn = (v === "high"); } catch (_) {}
}

/* Public read used by chat/stream.js. Always returns a valid value. */
export function getReasoningEffort() {
  return _load();
}

function _t(key, fallback) {
  if (typeof window.t === "function") {
    var s = window.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

function _labelFor(v) {
  if (v === "high") return _t("effort.high", "High");
  if (v === "low") return _t("effort.low", "Low");
  return _t("effort.medium", "Medium");
}

function _activeModelLabel() {
  var cfg = window.apiConfig || {};
  var providers = Array.isArray(cfg.providers) ? cfg.providers : [];
  var active = providers.find(function (p) { return p && p.id === cfg.activeId; });
  if (!active) return "";
  var label = String(active.label || "").trim();
  var model = String(active.model || "").trim();
  if (label && label !== "Default") return label;
  return model;
}

/* Toggle the anchored configuration popover for the clicked trigger. */
export function toggleEffortPicker(el) {
  openChatConfiguration(el || null);
}

/* Refresh every trigger: the visible pill text stays the fixed i18n label
   (思考强度); the live "model · level" value rides on the tooltip and
   aria-label so it stays one hover away and announced to screen readers. */
export function syncEffortUI() {
  var v = _load();
  document.querySelectorAll(".effort-picker").forEach(function (picker) {
    /* P_effort-glyph — kept for any residual markup/CSS that still keys off
       the level attribute. */
    picker.setAttribute("data-effort", v);
    var effortLabel = _labelFor(v);
    var modelLabel = _activeModelLabel();
    var fullLabel = modelLabel ? modelLabel + " · " + effortLabel : effortLabel;
    var trigger = picker.querySelector(".effort-trigger");
    if (trigger) {
      trigger.setAttribute("aria-label", fullLabel);
      trigger.setAttribute("title", fullLabel);
      trigger.setAttribute("data-model-label", modelLabel);
    }
  });
}

if (typeof document !== "undefined") {
  /* The popover owns persistence, but other writes (settings, tests) can
     still land — keep the derived thinking flag and tooltip copy in sync. */
  window.addEventListener("socrates:chat-preferences", function (event) {
    var detail = event && event.detail || {};
    _effort = VALID.indexOf(detail.effort) >= 0 ? detail.effort : getStoredReasoningEffort();
    _syncThinking(_effort);
    syncEffortUI();
  });
  window.addEventListener("DOMContentLoaded", function () { try { syncEffortUI(); } catch (_) {} });
  if (document.readyState !== "loading") { try { syncEffortUI(); } catch (_) {} }
}
