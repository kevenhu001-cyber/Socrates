import { getStoredReasoningEffort } from '../config/chatPreferences.ts';
import { openChatConfiguration } from '../react/chat-configuration/chatConfiguration.bridge.ts';
import { getProviderConfigSnapshot, subscribeToProviderConfig } from '../config/providerConfig.store.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

/* ui/effortPicker.ts — the composer "思考强度" pill.
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

const VALID = ["high", "medium", "low", "instant"];
let _effort = null;
const MOBILE_QUERY = '(max-width: 768px)';

function _load() {
  const v = getStoredReasoningEffort();
  _effort = VALID.indexOf(v) >= 0 ? v : "medium";
  _syncThinking(_effort);
  return _effort;
}

function _syncThinking(v: string) {
  try { browserWindow.extensiveThinkingOn = (v === "high"); } catch (error) { reportSwallow(error, 'ui/effortPicker.ts:34'); }
}

/* Public read used by chat/stream.js. Always returns a valid value. */
export function getReasoningEffort() {
  return _load();
}

function _t(key: string, fallback: string) {
  if (typeof browserWindow.t === "function") {
    const s = browserWindow.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

function _labelFor(v: string) {
  if (v === "instant") return _t("effort.instant", "Instant");
  if (v === "high") return _t("effort.high", "High");
  if (v === "low") return _t("effort.low", "Low");
  return _t("effort.medium", "Medium");
}

function _activeModelLabel() {
  const cfg = getProviderConfigSnapshot();
  const providers = Array.isArray(cfg.providers) ? cfg.providers : [];
  const active = providers.find(function (p) { return p && p.id === cfg.activeId; });
  if (!active) return "";
  const label = String(active.label || "").trim();
  const model = String(active.model || "").trim();
  if (label && label !== "Default") return label;
  return model;
}

function _composerEffortVisible() {
  try { return browserWindow.matchMedia && browserWindow.matchMedia(MOBILE_QUERY).matches; }
  catch (_) { return false; }
}

function _syncComposerEffortVisibility() {
  const visible = _composerEffortVisible();
  document.querySelectorAll('.effort-picker').forEach(function (picker) {
    (picker as HTMLElement).hidden = !visible;
    picker.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });
}

/* Toggle the anchored configuration popover for the clicked trigger. */
export function toggleEffortPicker(el: any) {
  openChatConfiguration(el || null);
}

/* Refresh every trigger: the live model/level value rides on the tooltip and
   aria-label. On desktop the composer copy stays hidden and the same config is
   available from the top-bar switcher; on phones the compact level remains in
   the composer rail. */
export function syncEffortUI() {
  const v = _load();
  _syncComposerEffortVisibility();
  document.querySelectorAll(".effort-picker").forEach(function (picker) {
    picker.setAttribute("data-effort", v);
    const effortLabel = _labelFor(v);
    const modelLabel = _activeModelLabel();
    const fullLabel = modelLabel ? modelLabel + " · " + effortLabel : effortLabel;
    const trigger = picker.querySelector(".effort-trigger");
    if (trigger) {
      trigger.setAttribute("aria-label", fullLabel);
      trigger.setAttribute("title", fullLabel);
      trigger.setAttribute("data-model-label", modelLabel);
    }
    const valueEl = picker.querySelector(".effort-value");
    if (valueEl) valueEl.textContent = effortLabel;
  });
  /* Top-bar model switcher: "Socrates <model>" like chatgpt.com's header. */
  const switcher = document.getElementById("topModelSwitcher");
  if (switcher) {
    const model = _activeModelLabel();
    const modelEl = document.getElementById("topModelSwitcherModel");
    if (modelEl) modelEl.textContent = model || "";
    const label = model ? model + " · " + _labelFor(v) : _labelFor(v);
    switcher.setAttribute("title", label);
    /* WCAG 2.5.3 (label in name): the accessible name has to contain the text
       the button shows. A static "Model and reasoning" did not, so the model
       is named first and the control's purpose follows it. The purpose phrase
       stays localized through the same i18n key the title uses. */
    const nameEl = switcher.querySelector(".top-model-switcher-name");
    const visible = nameEl ? String(nameEl.textContent || "").trim() : "";
    const purpose = _t("topbar.modelSwitcher", "Model and reasoning");
    const accessible = (visible + " " + model).replace(/\s+/g, " ").trim();
    switcher.setAttribute("aria-label", accessible ? accessible + " — " + purpose : purpose);
  }
}

if (typeof document !== "undefined") {
  subscribeToProviderConfig(syncEffortUI);
  document.addEventListener("click", function (event) {
    const switcher = event.target && (event.target as Element).closest && (event.target as Element).closest("#topModelSwitcher");
    if (!switcher) return;
    event.preventDefault();
    openChatConfiguration(switcher as HTMLElement);
  });
}

if (typeof document !== "undefined") {
  /* The popover owns persistence, but other writes (settings, tests) can
     still land — keep the derived thinking flag and tooltip copy in sync. */
  browserWindow.addEventListener("socrates:chat-preferences", function (event) {
    const detail = event && (event as CustomEvent).detail || {};
    _effort = VALID.indexOf(detail.effort) >= 0 ? detail.effort : getStoredReasoningEffort();
    _syncThinking(_effort);
    syncEffortUI();
  });
  browserWindow.addEventListener('resize', _syncComposerEffortVisibility, { passive: true });
  browserWindow.addEventListener("DOMContentLoaded", function () { try { syncEffortUI(); } catch (error) { reportSwallow(error, 'ui/effortPicker.ts:147'); } });
  if (document.readyState !== "loading") { try { syncEffortUI(); } catch (error) { reportSwallow(error, 'ui/effortPicker.ts:148'); } }
}
