/* ui/effortPicker.ts — combined Model + Reasoning-effort selector.
 *
 * P_chatgpt-landing (v2). Originally a 高/中/低 effort dropdown; the model
 * picker + extensions picker below the composer were removed, so model
 * selection is now merged into this one control. Clicking the trigger
 * opens a single menu with two sections:
 *   - 模型 (Models): the provider list from window.apiConfig; clicking one
 *     calls window.pickActiveProviderById(id). A trailing "管理模型…" row
 *     opens Settings.
 *   - 思维强度 (Reasoning effort): 高 / 中 / 低.
 *
 * The trigger label stays compact (just the effort word) to avoid the
 * text-clipping seen when it grew too wide.
 *
 * Menu positioning uses position:fixed computed from the trigger's
 * bounding rect on open. The composer wrap has overflow:hidden +
 * border-radius, which previously clipped the upward-opening menu (the
 * "高" row was cut off). Fixed positioning escapes that ancestor clip.
 *
 * Persistence: localStorage["socrates-reasoning-effort"] ∈ high|medium|low.
 */

declare global {
  interface Window {
    apiConfig?: {
      providers?: Array<Record<string, any>>;
      activeId?: string;
    };
    pickActiveProviderById: (id: string) => void;
    extensiveThinkingOn?: boolean;
  }
}

var STORAGE_KEY = "socrates-reasoning-effort";
var VALID = ["high", "medium", "low"];
var _effort: string | null = null;

function _load(): string {
  if (_effort) return _effort;
  var v: string | null = null;
  try { v = localStorage.getItem(STORAGE_KEY); } catch (_) { }
  _effort = VALID.indexOf(v!) >= 0 ? v! : "medium";
  _syncThinking(_effort);
  return _effort;
}

/* Deep thinking is now derived from reasoning effort: High effort turns
   on the verbose "careful scholar" chat prompt (extensive thinking),
   Medium/Low use the concise prompt. main.js reads
   window.extensiveThinkingOn when building the system prompt, so keep it
   in sync here whenever the effort changes or loads. */
function _syncThinking(v: string): void {
  try { window.extensiveThinkingOn = (v === "high"); } catch (_) { }
}

/* Public read used by chat/stream.js. Always returns a valid value. */
export function getReasoningEffort(): string {
  return _load();
}

function _t(key: string, fallback: string): string {
  if (typeof window.t === "function") {
    var s = window.t(key);
    if (s && s !== key) return s;
  }
  return fallback;
}

function _labelFor(v: string): string {
  if (v === "high") return _t("effort.high", "High");
  if (v === "low") return _t("effort.low", "Low");
  return _t("effort.medium", "Medium");
}

function _esc(s: unknown): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c: string) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!;
  });
}

export function setReasoningEffort(v: string): void {
  if (VALID.indexOf(v) < 0) return;
  _effort = v;
  try { localStorage.setItem(STORAGE_KEY, v); } catch (_) { }
  _syncThinking(v);
  _closeAll();
  syncEffortUI();
}

/* ── Model section HTML (reuses .model-picker-item markup so the
   existing model-picker CSS styles it). ── */
function _modelSectionHTML(): string {
  var cfg = window.apiConfig || {};
  var providers = (cfg.providers || []).slice();
  var activeId = cfg.activeId;
  var html = '<div class="picker-section-label">' + _esc(_t("picker.modelSection", "Models")) + "</div>";
  if (!providers.length) {
    html += '<div class="model-picker-empty">' + _esc(_t("picker.noModels", "No models yet.")) + "</div>";
  } else {
    providers.sort(function (a: Record<string, any>, b: Record<string, any>) {
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      return 0;
    });
    providers.forEach(function (p: Record<string, any>) {
      var isActive = p && p.id === activeId;
      /* "Default" is the server-side fallback provider label, not a
         meaningful model name for people choosing a model. */
      var name = _esc((p.label && p.label !== "Default") ? p.label : (p.model || p.label || "Model"));
      var sub = p.isBuiltIn ? "" : _esc(p.model || "");
      var subLine = sub && sub !== name ? sub : (p.isBuiltIn ? "" : _esc(p.url || ""));
      html += '<button type="button" class="model-picker-item' + (isActive ? " active" : "") +
        '" data-id="' + _esc(p.id || "") + '" role="option" aria-selected="' + isActive + '">';
      html += '<span class="model-picker-item-main"><span class="model-picker-item-name">' + name + "</span>";
      if (subLine) html += '<span class="model-picker-item-sub">' + subLine + "</span>";
      html += "</span>";
      html += '<svg class="model-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
      html += "</button>";
    });
  }
  html += '<button type="button" class="model-picker-add" data-action="manage-models">' +
    _esc(providers.length ? _t("picker.manageModels", "Manage models\u2026") : _t("picker.addModel", "Add a model\u2026")) +
    "</button>";
  return html;
}

function _effortSectionHTML(v: string): string {
  var html = '<div class="effort-divider"></div>';
  html += '<div class="picker-section-label">' + _esc(_t("picker.effortSection", "Reasoning")) + "</div>";
  var note = _t("effort.high.note", "Deeper, more thorough thinking");
  ["high", "medium", "low"].forEach(function (e: string) {
    html += '<button type="button" class="effort-item' + (e === v ? " active" : "") +
      '" data-effort="' + e + '" role="option" aria-selected="' + (e === v) + '"><span>' +
      _esc(_labelFor(e)) + "</span>";
    /* Surface that High effort == deep thinking, so removing the old
       standalone "Deep thinking" toggle stays discoverable. */
    if (e === "high") html += '<span class="effort-item-note">' + _esc(note) + "</span>";
    html += "</button>";
  });
  return html;
}

/* Toggle the dropdown that owns the clicked trigger. */
export function toggleEffortPicker(el: HTMLElement): void {
  var picker = el && el.closest ? el.closest(".effort-picker") as HTMLElement | null : null;
  if (!picker) return;
  var open = picker.getAttribute("data-open") === "true";
  _closeAll();
  if (!open) {
    syncEffortUI();
    picker.setAttribute("data-open", "true");
    var t = picker.querySelector(".effort-trigger") as HTMLElement | null;
    if (t) t.setAttribute("aria-expanded", "true");
    _positionMenu(picker);
  }
}

/* Fixed-position the menu above the trigger, clamped to the viewport so
   the composer's overflow:hidden can't clip it. */
function _positionMenu(picker: HTMLElement): void {
  var trigger = picker.querySelector(".effort-trigger") as HTMLElement | null;
  var menu = picker.querySelector(".effort-menu") as HTMLElement | null;
  if (!trigger || !menu) return;
  var r = trigger.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.bottom = "auto";
  menu.style.right = "auto";
  /* Measure after it's displayed (data-open drives display:flex). */
  var mh = menu.offsetHeight || 240;
  var mw = menu.offsetWidth || 200;
  var gap = 6;
  var top = r.top - mh - gap;
  if (top < 8) top = 8; /* clamp to top of viewport */
  var left = r.left;
  var vw = window.innerWidth || document.documentElement.clientWidth;
  if (left + mw > vw - 8) left = vw - 8 - mw;
  if (left < 8) left = 8;
  menu.style.top = top + "px";
  menu.style.left = left + "px";
}

function _closeAll(): void {
  document.querySelectorAll(".effort-picker[data-open='true']").forEach(function (p) {
    var picker = p as HTMLElement;
    picker.setAttribute("data-open", "false");
    var t = picker.querySelector(".effort-trigger") as HTMLElement | null;
    if (t) t.setAttribute("aria-expanded", "false");
    var m = picker.querySelector(".effort-menu") as HTMLElement | null;
    if (m) {
      m.style.position = "";
      m.style.top = "";
      m.style.left = "";
      m.style.right = "";
      m.style.bottom = "";
    }
  });
}

/* Refresh every picker: trigger label + full menu content (model + effort). */
export function syncEffortUI(): void {
  var v = _load();
  document.querySelectorAll(".effort-picker").forEach(function (picker) {
    var label = picker.querySelector(".effort-label") as HTMLElement | null;
    if (label) label.textContent = _labelFor(v);
    var menu = picker.querySelector(".effort-menu") as HTMLElement | null;
    if (menu) menu.innerHTML = _modelSectionHTML() + _effortSectionHTML(v);
  });
}

/* ── Delegated menu clicks (model item / manage / effort item) ── */
if (typeof document !== "undefined") {
  document.addEventListener("click", function (e: MouseEvent) {
    var target = e.target as HTMLElement | null;
    var menu = target && target.closest ? target.closest(".effort-menu") as HTMLElement | null : null;
    if (menu) {
      var effortBtn = target && target.closest ? target.closest(".effort-item") as HTMLElement | null : null;
      if (effortBtn) { setReasoningEffort(effortBtn.getAttribute("data-effort") || "medium"); return; }
      var manage = target && target.closest ? target.closest('[data-action="manage-models"]') as HTMLElement | null : null;
      if (manage) {
        _closeAll();
        if (typeof window.openSettings === "function") window.openSettings();
        return;
      }
      var modelBtn = target && target.closest ? target.closest(".model-picker-item") as HTMLElement | null : null;
      if (modelBtn) {
        var id = modelBtn.getAttribute("data-id");
        if (id && typeof window.pickActiveProviderById === "function") {
          window.pickActiveProviderById(id);
        }
        syncEffortUI();
        var picker = menu.closest(".effort-picker") as HTMLElement | null;
        if (picker) _positionMenu(picker);
        return;
      }
      return; /* click inside menu but not on an item — keep open */
    }
    /* Outside any menu — close, unless the click was on a trigger (its
       own onclick toggler handles open/close). */
    if (target && target.closest && target.closest(".effort-picker")) return;
    _closeAll();
  });
  document.addEventListener("keydown", function (e: KeyboardEvent) {
    if (e.key === "Escape") _closeAll();
  });
  window.addEventListener("resize", function () { _closeAll(); });
  window.addEventListener("DOMContentLoaded", function () { try { syncEffortUI(); } catch (_) { } });
  if (document.readyState !== "loading") { try { syncEffortUI(); } catch (_) { } }
}
