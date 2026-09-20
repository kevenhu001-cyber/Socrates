import { pickActiveProviderById } from '../pickers.js';
/* ui/effortPicker.js — combined Model + Reasoning-effort selector.
 *
 * P_chatgpt-landing (v2). Originally a 高/中/低 effort dropdown; the model
 * picker + extensions picker below the composer were removed, so model
 * selection is now merged into this one control. Clicking the trigger
 * opens a single menu with two sections:
 *   - 模型 (Models): the provider list from window.apiConfig; clicking one
 *     calls pickActiveProviderById(id). A trailing "管理模型…" row
 *     opens Settings.
 *   - 思维强度 (Reasoning effort): 高 / 中 / 低.
 *
 * The trigger stays compact everywhere: it shows only the effort word
 * (高 / 中 / Low…); the active model name rides on the tooltip /
 * aria-label and heads the Models section once the menu opens.
 *
 * Menu positioning uses position:fixed computed from the trigger's
 * bounding rect on open. The composer wrap has overflow:hidden +
 * border-radius, which previously clipped the upward-opening menu (the
 * "高" row was cut off). Fixed positioning escapes that ancestor clip.
 *
 * Persistence: localStorage["socrates-reasoning-effort"] ∈ high|medium|low.
 */

var STORAGE_KEY = "socrates-reasoning-effort";
var VALID = ["high", "medium", "low"];
var _effort = null;
var _openPicker = null;
var _openMenu = null;
var _menuPlaceholder = null;

function _load() {
  if (_effort) return _effort;
  var v = null;
  try { v = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  _effort = VALID.indexOf(v) >= 0 ? v : "medium";
  _syncThinking(_effort);
  return _effort;
}

/* Deep thinking is now derived from reasoning effort: High effort turns
   on the verbose "careful scholar" chat prompt (extensive thinking),
   Medium/Low use the concise prompt. main.js reads
   window.extensiveThinkingOn when building the system prompt, so keep it
   in sync here whenever the effort changes or loads. */
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

function _triggerLabel(v) {
  /* The pill shows only the reasoning level on every viewport, like the
     chatgpt.com mobile composer. The model name lives in the trigger's
     tooltip / aria-label and in the menu's Models section — painting it
     permanently cost ~90px of composer width and read as noise next to
     the input text. */
  return _labelFor(v);
}

function _esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

export function setReasoningEffort(v) {
  if (VALID.indexOf(v) < 0) return;
  _effort = v;
  try { localStorage.setItem(STORAGE_KEY, v); } catch (_) {}
  _syncThinking(v);
  _closeAll();
  syncEffortUI();
}

/* ── Model section HTML (reuses .model-picker-item markup so the
   existing model-picker CSS styles it). ── */
function _modelSectionHTML() {
  var cfg = window.apiConfig || {};
  var providers = (cfg.providers || []).slice();
  var activeId = cfg.activeId;
  var html = '<div class="picker-section-label">' + _esc(_t("picker.modelSection", "Models")) + "</div>";
  if (!providers.length) {
    html += '<div class="model-picker-empty">' + _esc(_t("picker.noModels", "No models yet.")) + "</div>";
  } else {
    providers.sort(function (a, b) {
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      return 0;
    });
    providers.forEach(function (p) {
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
  html += '<button type="button" class="model-picker-add">' +
          _esc(providers.length ? _t("picker.manageModels", "Manage models…") : _t("picker.addModel", "Add a model…")) +
          "</button>";
  return html;
}

function _effortSectionHTML(v) {
  var html = '<div class="effort-divider"></div>';
  html += '<div class="picker-section-label">' + _esc(_t("picker.effortSection", "Reasoning")) + "</div>";
  var note = _t("effort.high.note", "Deeper, more thorough thinking");
  ["high", "medium", "low"].forEach(function (e) {
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
export function toggleEffortPicker(el) {
  var picker = el && el.closest ? el.closest(".effort-picker") : null;
  if (!picker) return;
  var open = picker.getAttribute("data-open") === "true";
  _closeAll();
  if (!open) {
    syncEffortUI();
    picker.setAttribute("data-open", "true");
    var t = picker.querySelector(".effort-trigger");
    if (t) t.setAttribute("aria-expanded", "true");
    _portalMenu(picker);
    _positionMenu(picker);
  }
}

/* Move the menu to <body> while open. A fixed descendant can still be
   clipped or re-based by a transformed/contained composer ancestor;
   portalling removes that entire class of dropdown failures. */
function _portalMenu(picker) {
  var menu = picker.querySelector(".effort-menu");
  if (!menu) return;
  _openPicker = picker;
  _openMenu = menu;
  _menuPlaceholder = document.createComment("effort-menu-placeholder");
  menu.parentNode.insertBefore(_menuPlaceholder, menu);
  document.body.appendChild(menu);
  menu.classList.add("portal-open");
}

/* Fixed-position the menu above the trigger, clamped to the viewport so
   the composer's overflow:hidden can't clip it. */
function _positionMenu(picker) {
  var trigger = picker.querySelector(".effort-trigger");
  var menu = picker === _openPicker ? _openMenu : picker.querySelector(".effort-menu");
  if (!trigger || !menu) return;
  var r = trigger.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.bottom = "auto";
  menu.style.right = "auto";
  var viewport = window.visualViewport;
  var viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  var viewportHeight = viewport ? viewport.height : (window.innerHeight || 0);
  var viewportBottom = viewportTop + viewportHeight;
  var viewportWidth = viewport ? viewport.width : (window.innerWidth || document.documentElement.clientWidth);
  menu.style.maxHeight = Math.max(120, viewportHeight - 16) + "px";
  /* Measure after it's displayed (data-open drives display:flex). */
  var mh = menu.offsetHeight || 240;
  var mw = menu.offsetWidth || 200;
  var gap = 6;
  var top = r.top - mh - gap;
  if (top < viewportTop + 8) top = r.bottom + gap;
  top = Math.max(viewportTop + 8, Math.min(viewportBottom - mh - 8, top));
  var left = r.left;
  if (left + mw > viewportWidth - 8) left = viewportWidth - 8 - mw;
  if (left < 8) left = 8;
  menu.style.top = top + "px";
  menu.style.left = left + "px";
}

function _closeAll() {
  document.querySelectorAll(".effort-picker[data-open='true']").forEach(function (p) {
    p.setAttribute("data-open", "false");
    var t = p.querySelector(".effort-trigger");
    if (t) t.setAttribute("aria-expanded", "false");
  });
  var m = _openMenu;
  if (m) {
    m.classList.remove("portal-open");
    m.style.position = "";
    m.style.top = "";
    m.style.left = "";
    m.style.right = "";
    m.style.bottom = "";
    if (_menuPlaceholder && _menuPlaceholder.parentNode) {
      _menuPlaceholder.parentNode.insertBefore(m, _menuPlaceholder);
      _menuPlaceholder.remove();
    }
  }
  _openPicker = null;
  _openMenu = null;
  _menuPlaceholder = null;
}

/* Refresh every picker: trigger label + full menu content (model + effort). */
export function syncEffortUI() {
  var v = _load();
  document.querySelectorAll(".effort-picker").forEach(function (picker) {
    /* P_effort-glyph — expose the current level as a data attribute so the
       trigger's bar indicator can fill in the right number of segments
       without each picker having to listen for changes. */
    picker.setAttribute("data-effort", v);
    var displayLabel = _triggerLabel(v);
    var modelLabel = _activeModelLabel();
    /* The visible pill is level-only; the full "model · level" stays on
       the tooltip and aria-label so the info is one hover away and
       screen readers still announce it. */
    var fullLabel = modelLabel ? modelLabel + " · " + displayLabel : displayLabel;
    var label = picker.querySelector(".effort-label");
    if (label) label.textContent = displayLabel;
    var trigger = picker.querySelector(".effort-trigger");
    if (trigger) {
      trigger.setAttribute("aria-label", fullLabel);
      trigger.setAttribute("title", fullLabel);
      trigger.setAttribute("data-model-label", modelLabel);
    }
    var menu = picker.querySelector(".effort-menu");
    if (menu) menu.innerHTML = _modelSectionHTML() + _effortSectionHTML(v);
  });
}

/* ── Delegated menu clicks (model item / manage / effort item) ── */
if (typeof document !== "undefined") {
  document.addEventListener("click", function (e) {
    var menu = e.target.closest ? e.target.closest(".effort-menu") : null;
    if (menu) {
      var effortBtn = e.target.closest(".effort-item");
      if (effortBtn) { setReasoningEffort(effortBtn.getAttribute("data-effort")); return; }
      var manage = e.target.closest(".model-picker-add");
      if (manage) {
        _closeAll();
        if (typeof window.openSettings === "function") window.openSettings();
        return;
      }
      var modelBtn = e.target.closest(".model-picker-item");
      if (modelBtn) {
        var id = modelBtn.getAttribute("data-id");
        if (id && typeof pickActiveProviderById === "function") {
          pickActiveProviderById(id);
        }
        _closeAll();
        syncEffortUI();
        return;
      }
      return; /* click inside menu but not on an item — keep open */
    }
    /* Outside any menu — close, unless the click was on a trigger (its
       own onclick toggler handles open/close). */
    if (e.target.closest && e.target.closest(".effort-picker")) return;
    _closeAll();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") _closeAll();
  });
  window.addEventListener("resize", function () { _closeAll(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      if (_openPicker) _positionMenu(_openPicker);
    });
    window.visualViewport.addEventListener("scroll", function () {
      if (_openPicker) _positionMenu(_openPicker);
    });
  }
  window.addEventListener("DOMContentLoaded", function () { try { syncEffortUI(); } catch (_) {} });
  if (document.readyState !== "loading") { try { syncEffortUI(); } catch (_) {} }
}
