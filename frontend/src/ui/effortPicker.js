import { getStoredReasoningEffort } from '../config/chatPreferences.ts';
import { openChatConfiguration } from '../react/chat-configuration/chatConfiguration.bridge.ts';
import { getProviderConfigSnapshot, subscribeToProviderConfig } from '../config/providerConfig.store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
/* ui/effortPicker.js — the composer "思考强度" pill.
 *
 * The compact pill is a phone affordance. Desktop already exposes the same
 * model/reasoning configuration through #topModelSwitcher, so repeating the
 * effort control inside the composer makes the primary input rail look like a
 * power-user toolbar. syncEffortUI() therefore keeps the picker mounted but
 * hidden on desktop and reveals it on phone layouts; this preserves state,
 * accessibility wiring and the single composer DOM while reducing default
 * desktop capability density.
 *
 * Deep thinking is derived from reasoning effort: High turns on the verbose
 * "careful scholar" chat prompt via window.extensiveThinkingOn (read by
 * main.js when building the system prompt).
 *
 * Persistence: localStorage["socrates-reasoning-effort"] ∈ instant|low|medium|high
 * (schema-validated by config/chatPreferences.ts).
 */

var VALID = ["high", "medium", "low", "instant"];
var _effort = null;
var MOBILE_QUERY = '(max-width: 768px)';

function _load() {
  var v = getStoredReasoningEffort();
  _effort = VALID.indexOf(v) >= 0 ? v : "medium";
  _syncThinking(_effort);
  return _effort;
}

function _syncThinking(v) {
  try { window.extensiveThinkingOn = (v === "high"); } catch (error) { reportSwallow(error, 'ui/effortPicker.js:34'); }
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
  if (v === "instant") return _t("effort.instant", "Instant");
  if (v === "high") return _t("effort.high", "High");
  if (v === "low") return _t("effort.low", "Low");
  return _t("effort.medium", "Medium");
}

function _activeModelLabel() {
  var cfg = getProviderConfigSnapshot();
  var providers = Array.isArray(cfg.providers) ? cfg.providers : [];
  var active = providers.find(function (p) { return p && p.id === cfg.activeId; });
  if (!active) return "";
  var label = String(active.label || "").trim();
  var model = String(active.model || "").trim();
  if (label && label !== "Default") return label;
  return model;
}

function _composerEffortVisible() {
  try { return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches; }
  catch (_) { return false; }
}

function _syncComposerEffortVisibility() {
  var visible = _composerEffortVisible();
  document.querySelectorAll('.effort-picker').forEach(function (picker) {
    picker.hidden = !visible;
    picker.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
}

/* Toggle the anchored configuration popover for the clicked trigger. */
export function toggleEffortPicker(el) {
  openChatConfiguration(el || null);
}

/* Refresh every trigger: the live model/level value rides on the tooltip and
   aria-label. On desktop the composer copy stays hidden and the same config is
   available from the top-bar switcher; on phones the compact level remains in
   the composer rail. */
export function syncEffortUI() {
  var v = _load();
  _syncComposerEffortVisibility();
  document.querySelectorAll(".effort-picker").forEach(function (picker) {
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
    var valueEl = picker.querySelector(".effort-value");
    if (valueEl) valueEl.textContent = effortLabel;
  });
  /* Top-bar model switcher: "Socrates <model>" like chatgpt.com's header. */
  var switcher = document.getElementById("topModelSwitcher");
  if (switcher) {
    var model = _activeModelLabel();
    var modelEl = document.getElementById("topModelSwitcherModel");
    if (modelEl) modelEl.textContent = model || "";
    var label = model ? model + " · " + _labelFor(v) : _labelFor(v);
    switcher.setAttribute("title", label);
    /* WCAG 2.5.3 (label in name): the accessible name has to contain the text
       the button shows. A static "Model and reasoning" did not, so the model
       is named first and the control's purpose follows it. The purpose phrase
       stays localized through the same i18n key the title uses. */
    var nameEl = switcher.querySelector(".top-model-switcher-name");
    var visible = nameEl ? String(nameEl.textContent || "").trim() : "";
    var purpose = _t("topbar.modelSwitcher", "Model and reasoning");
    var accessible = (visible + " " + model).replace(/\s+/g, " ").trim();
    switcher.setAttribute("aria-label", accessible ? accessible + " — " + purpose : purpose);
  }
}

if (typeof document !== "undefined") {
  subscribeToProviderConfig(syncEffortUI);
  document.addEventListener("click", function (event) {
    var switcher = event.target && event.target.closest && event.target.closest("#topModelSwitcher");
    if (!switcher) return;
    event.preventDefault();
    openChatConfiguration(switcher);
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
  window.addEventListener('resize', _syncComposerEffortVisibility, { passive: true });
  window.addEventListener("DOMContentLoaded", function () { try { syncEffortUI(); } catch (error) { reportSwallow(error, 'ui/effortPicker.js:147'); } });
  if (document.readyState !== "loading") { try { syncEffortUI(); } catch (error) { reportSwallow(error, 'ui/effortPicker.js:148'); } }
}
