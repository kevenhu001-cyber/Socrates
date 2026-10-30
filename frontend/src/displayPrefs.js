/* ─── Display Preferences Module ───
   Text size, content width, background colors, grid toggle.
   Persisted in localStorage as `socrates-display`.
   ============================================================ */

import { applyCustomBg, removeCustomBg, parseHexColor } from './util/colors.ts';
import { DEFAULT_DARK_PICKER, DEFAULT_LIGHT_PICKER } from './ui/tokens.ts';
import { restingRect } from './ui/pressFeedback.js';

/* ── constants ── */
export const DISPLAY_FONT_STEPS  = [1, 1.125, 1.25, 1.375];
export const DISPLAY_WIDTH_STEPS = [0.85,  1, 1.3,   1.7];
export const FONT_LABELS  = ["S","M","L","XL"];
export const WIDTH_LABELS = ["S","M","L","XL"];
export const THEME_PREFERENCES = ["system", "light", "dark"];
export const THEME_STYLES = ["socrates", "philosophy"];

/* ── state ── */
export var displayPrefs = { font: 1.125, width: 1, darkBg: "", lightBg: "", showGrid: false };

var _systemThemeQuery = null;
var _themeControlsDelegated = false;

function isThemePreference(value) {
  return THEME_PREFERENCES.indexOf(value) !== -1;
}

function isThemeStyle(value) {
  return THEME_STYLES.indexOf(value) !== -1;
}

export function getThemeStyle() {
  var attr = document.documentElement.getAttribute("data-theme");
  if (isThemeStyle(attr)) return attr;
  try {
    var saved = localStorage.getItem("socrates-theme-style");
    if (isThemeStyle(saved)) return saved;
  } catch (_) { /* empty-catch: intentional — theme style preference read is best-effort */ }
  return "socrates";
}

export function setThemeStyle(style) {
  if (!isThemeStyle(style)) return;
  document.documentElement.setAttribute("data-theme", style);
  try { localStorage.setItem("socrates-theme-style", style); } catch (_) { /* empty-catch: intentional — theme style preference write is best-effort */ }
  syncThemeUI();
  applyDisplayPrefs();
}

function systemThemeMode() {
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch (_) {
    return "dark";
  }
}

export function getThemePreference() {
  var attr = document.documentElement.getAttribute("data-theme-preference");
  if (isThemePreference(attr)) return attr;
  try {
    var saved = localStorage.getItem("socrates-theme");
    if (isThemePreference(saved)) return saved;
  } catch (_) { /* ignore */ }
  return "dark";
}

export function resolveThemeMode(preference) {
  return preference === "system" ? systemThemeMode() : (preference === "light" ? "light" : "dark");
}

function syncMermaidTheme(mode) {
  try {
    if (typeof mermaid !== "undefined" && mermaid.initialize) {
      mermaid.initialize({ startOnLoad: false, theme: mode === "dark" ? "dark" : "default" });
    }
  } catch (_) { /* ignore */ }
}

export function syncThemeUI() {
  var html = document.documentElement;
  var preference = html.getAttribute("data-theme-preference") || getThemePreference();
  var options = document.querySelectorAll("[data-theme-option]");
  options.forEach(function (option) {
    var active = option.getAttribute("data-theme-option") === preference;
    option.classList.toggle("on", active);
    option.setAttribute("aria-checked", active ? "true" : "false");
  });
  var currentStyle = html.getAttribute("data-theme") || getThemeStyle();
  var styleOptions = document.querySelectorAll("[data-theme-style-option]");
  styleOptions.forEach(function (option) {
    var active = option.getAttribute("data-theme-style-option") === currentStyle;
    option.classList.toggle("on", active);
    option.setAttribute("aria-checked", active ? "true" : "false");
  });
  /* P_display-prefs-no-dup — the theme row is a radiogroup, so the checked
     radio already states the current theme. The old #displayThemeModeLabel
     readout repeated the same word next to it. */
  var toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.setAttribute("data-theme-preference", preference);
    var toggleLabel = typeof window.t === "function" ? window.t("display.themeToggle") : "Toggle theme";
    toggle.setAttribute("title", toggleLabel);
    toggle.setAttribute("aria-label", toggleLabel);
  }
}

function syncBrowserChromeColor(mode) {
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  var color = "";
  try {
    color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  } catch (_) { /* computed style unavailable during boot — use the fallback */ }
  if (!color || color.indexOf("var(") !== -1) {
    color = mode === "dark" ? "#121110" : "#f7f4ee";
  }
  meta.setAttribute("content", color);
}

function setEffectiveThemeMode(mode) {
  var html = document.documentElement;
  html.setAttribute("data-mode", mode);
  html.style.colorScheme = mode;
  syncMermaidTheme(mode);
  syncThemeUI();
  syncBrowserChromeColor(mode);
}

function watchSystemTheme() {
  if (_systemThemeQuery || !window.matchMedia) return;
  try {
    _systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      if (getThemePreference() !== "system") return;
      setEffectiveThemeMode(resolveThemeMode("system"));
      applyDisplayPrefs();
    };
    if (typeof _systemThemeQuery.addEventListener === "function") {
      _systemThemeQuery.addEventListener("change", onChange);
    } else if (typeof _systemThemeQuery.addListener === "function") {
      _systemThemeQuery.addListener(onChange);
    }
  } catch (_) { /* ignore */ }
}

export function initTheme() {
  var preference = getThemePreference();
  document.documentElement.setAttribute("data-theme-preference", preference);
  var style = getThemeStyle();
  document.documentElement.setAttribute("data-theme", style);
  setEffectiveThemeMode(resolveThemeMode(preference));
  watchSystemTheme();
  if (!_themeControlsDelegated) {
    document.addEventListener("click", function (event) {
      var target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
      var themeOption = target && target.closest("[data-theme-option]");
      if (themeOption) {
        setThemePreference(themeOption.getAttribute("data-theme-option"));
        return;
      }
      var styleOption = target && target.closest("[data-theme-style-option]");
      if (styleOption) setThemeStyle(styleOption.getAttribute("data-theme-style-option"));
    });
    _themeControlsDelegated = true;
  }
  syncThemeUI();
}

export function setThemePreference(preference) {
  if (!isThemePreference(preference)) return;
  document.documentElement.setAttribute("data-theme-preference", preference);
  try { localStorage.setItem("socrates-theme", preference); } catch (_) { /* ignore */ }
  setEffectiveThemeMode(resolveThemeMode(preference));
  applyDisplayPrefs();
}

/* ── helpers ── */
export function loadDisplayPrefs() {
  try {
    var raw = localStorage.getItem("socrates-display");
    if (raw) {
      var p = JSON.parse(raw);
      if (typeof p.font === "number" && p.font > 0) displayPrefs.font = p.font;
      if (typeof p.width === "number" && p.width > 0) displayPrefs.width = p.width;
      if (typeof p.darkBg === "string") displayPrefs.darkBg = p.darkBg;
      if (typeof p.lightBg === "string") displayPrefs.lightBg = p.lightBg;
      if (p.showGrid === true) displayPrefs.showGrid = true;
      else displayPrefs.showGrid = false;
    }
  } catch { /* ignore */ }
  /* One-time cleanup: the accent-colour picker was removed, so drop any
     persisted accent preference and never let it resurface. */
  try {
    localStorage.removeItem("socrates-accent-hex");
    localStorage.removeItem("socrates-accent-hue");
  } catch { /* ignore */ }
  /* One-time migration (bgMigratedV1): earlier builds shipped warm/green
     default background picks (#252220 / #ded6c8) and let users store any
     hue, which fought the neutral ChatGPT-black theme ("跑色"). Strip any
     custom bg whose saturation is non-trivial so those users fall back to
     the neutral theme tokens. Runs once; users who deliberately pick a
     color afterwards are never touched again. */
  try {
    if (localStorage.getItem("socrates-bg-migrated-v1") !== "1") {
      var stripped = false;
      ["darkBg", "lightBg"].forEach(function (field) {
        var hex = displayPrefs[field];
        if (typeof hex === "string" && /^#?[0-9a-fA-F]{3,6}$/.test(hex.trim())) {
          var hsl = parseHexColor(hex.trim());
          /* Any perceptible chroma → drop it back to the neutral default. */
          if (hsl && hsl.s > 4) {
            displayPrefs[field] = "";
            stripped = true;
          }
        }
      });
      localStorage.setItem("socrates-bg-migrated-v1", "1");
      if (stripped) saveDisplayPrefs();
    }
  } catch { /* ignore */ }
  applyDisplayPrefs();
}

export function applyDisplayPrefs() {
  document.documentElement.style.setProperty("--app-font-scale", String(displayPrefs.font));
  document.documentElement.style.setProperty("--app-width-scale", String(displayPrefs.width));
  var mode = document.documentElement.getAttribute("data-mode") || "dark";
  var customHex = mode === "dark" ? displayPrefs.darkBg : displayPrefs.lightBg;
  if (customHex) {
    applyCustomBg(customHex, mode);
  } else {
    removeCustomBg();
  }
  document.documentElement.dataset.showGrid = displayPrefs.showGrid === false ? "false" : "true";
  syncDisplayPrefsUI();
  /* After font/width change, layout shifts — keep pinned users at bottom */
  if (typeof scrollToBottomIfPinned === "function") {
    scrollToBottomIfPinned();
  }
}

export function saveDisplayPrefs() {
  try { localStorage.setItem("socrates-display", JSON.stringify(displayPrefs)); } catch { /* ignore */ }
}

export function syncDisplayPrefsUI() {
  /* P_display-prefs-no-dup — the text-size and content-width rows are
     radiogroups now, so the selected radio carries the value on its own.
     The old #displayPrefsFontLabel / #displayPrefsWidthLabel readouts
     printed the same letter the highlighted segment already showed. */
  var fWrap = document.getElementById("displayPrefsFontSegs");
  if (fWrap) Array.from(fWrap.children).forEach(function (b) {
    var active = parseFloat(b.dataset.font) === displayPrefs.font;
    b.classList.toggle("on", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  var wWrap = document.getElementById("displayPrefsWidthSegs");
  if (wWrap) Array.from(wWrap.children).forEach(function (b) {
    var active = parseFloat(b.dataset.width) === displayPrefs.width;
    b.classList.toggle("on", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  /* Drive the sliding ::before indicator on each segs wrapper.
     After toggling .on, the active button's offsetLeft/offsetWidth
     reflects its new layout position — we copy those to CSS custom
     properties so the indicator animates between segments instead
     of snapping. Uses rAF on the first sync so the indicator lands
     at the correct position before the popover reveals, avoiding a
     flash from (0,0) to the real coordinates. */
  var sWrap = document.getElementById("displayThemeStyleSegs");
  var tWrap = document.getElementById("displayThemeSegs");
  [fWrap, wWrap, sWrap, tWrap].forEach(function (wrap) {
    if (!wrap) return;
    var onBtn = wrap.querySelector(".display-prefs-seg.on");
    if (!onBtn) return;
    /* If we already have the seg vars set, the transition will
       animate; otherwise wait one frame so initial layout is in
       place (avoids a 0,0 flash on first reveal). */
    var hasVars = wrap.style.getPropertyValue("--seg-x") && wrap.style.getPropertyValue("--seg-w");
    var apply = function () {
      var x = onBtn.offsetLeft;
      var w = onBtn.offsetWidth;
      if (w === 0) return;
      wrap.style.setProperty("--seg-x", x + "px");
      wrap.style.setProperty("--seg-w", w + "px");
    };
    if (!hasVars) requestAnimationFrame(apply);
    else apply();
  });
  var darkInput = document.getElementById("displayPrefsBgDark");
  if (darkInput) darkInput.value = displayPrefs.darkBg || DEFAULT_DARK_PICKER;
  var lightInput = document.getElementById("displayPrefsBgLight");
  if (lightInput) lightInput.value = displayPrefs.lightBg || DEFAULT_LIGHT_PICKER;
  var gt = document.getElementById("gridToggle");
  if (gt) {
    var gridOn = displayPrefs.showGrid !== false;
    gt.classList.toggle("on", gridOn);
    gt.setAttribute("aria-checked", gridOn ? "true" : "false");
  }
}

/* ── font / width ── */
export function setDisplayFont(step) {
  displayPrefs.font = step;
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function setDisplayWidth(step) {
  displayPrefs.width = step;
  applyDisplayPrefs();
  saveDisplayPrefs();
}

/* ── background colors ── */
export function setBackgroundColor(hex) {
  displayPrefs.darkBg = hex || "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function setBackgroundDark(hex) {
  displayPrefs.darkBg = hex || "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function setBackgroundLight(hex) {
  displayPrefs.lightBg = hex || "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function resetBackgroundColor() {
  displayPrefs.darkBg = "";
  displayPrefs.lightBg = "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function resetBackgroundDark() {
  displayPrefs.darkBg = "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function resetBackgroundLight() {
  displayPrefs.lightBg = "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

/* ── grid ── */
export function toggleGrid() {
  displayPrefs.showGrid = displayPrefs.showGrid === false;
  applyDisplayPrefs();
  saveDisplayPrefs();
}

/* React owns the display-preferences controls. These document-level bridges
 * keep the long-standing ids and external toggleDisplayPrefs() callers
 * working after the component mounts, without binding to short-lived nodes. */
export function mountDisplayPrefsListeners(){
  var marker = document.documentElement;
  if (marker.dataset.displayPrefsListenersMounted === "1") return null;
  marker.dataset.displayPrefsListenersMounted = "1";

  function onClick(event) {
    var target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    if (!target) return;
    if (target.closest("#displayPrefsBtn")) {
      event.preventDefault();
      toggleDisplayPrefs();
      return;
    }
    if (target.closest("#themeToggle")) {
      event.preventDefault();
      toggleTheme();
      return;
    }
    var font = target.closest("#displayPrefsFontSegs [data-font]");
    if (font) { setDisplayFont(parseFloat(font.dataset.font)); return; }
    var width = target.closest("#displayPrefsWidthSegs [data-width]");
    if (width) { setDisplayWidth(parseFloat(width.dataset.width)); return; }
    if (target.closest("#gridToggle")) { event.preventDefault(); toggleGrid(); return; }
    if (target.closest("#displayPrefsBgDarkReset")) { event.preventDefault(); resetBackgroundDark(); return; }
    if (target.closest("#displayPrefsBgLightReset")) { event.preventDefault(); resetBackgroundLight(); }
  }

  function onInput(event) {
    var target = event.target;
    if (!target) return;
    /* React's onChange owns native picker changes. This fallback preserves
       callers that dispatch the long-standing bubbling `input` event. */
    if (target.id === "displayPrefsBgDark" && target.value !== displayPrefs.darkBg) {
      setBackgroundDark(target.value);
    } else if (target.id === "displayPrefsBgLight" && target.value !== displayPrefs.lightBg) {
      setBackgroundLight(target.value);
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  return function unmountDisplayPrefsListeners() {
    document.removeEventListener("click", onClick);
    document.removeEventListener("input", onInput);
    delete marker.dataset.displayPrefsListenersMounted;
  };
}

/* ── popover ── */
export function toggleDisplayPrefs() {
  var p = document.getElementById("displayPrefsPopover");
  if (!p) return;
  var btn = document.getElementById("displayPrefsBtn");
  var isOpen = !p.classList.contains("hidden");
  if (isOpen) { p.classList.add("hidden"); return; }
  if (btn) {
    var r = restingRect(btn); /* not the mid-press box (ui/pressFeedback.js) */
    var popW = 240;
    var left = r.right - popW;
    if (left < 8) left = 8;
    var bottom = window.innerHeight - r.top + 8;
    p.style.left = left + "px";
    p.style.bottom = bottom + "px";
    p.style.right = "auto";
    p.style.top = "auto";
  }
  p.classList.remove("hidden");
  /* Resync now that the popover is visible. loadDisplayPrefs() ran
     at module init when this was display:none, so offsetWidth was 0
     and the indicator-position rAF inside syncDisplayPrefsUI bailed
     before --seg-x / --seg-w were ever set — meaning the sliding
     ::before pill stayed at the CSS default (0px, 0px) until the
     user picked a new size. Forcing a re-sync here lets the rAF
     actually measure and place the indicator for the saved values. */
  syncDisplayPrefsUI();
  setTimeout(function () {
    function onDoc(e) {
      if (p.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      p.classList.add("hidden");
      document.removeEventListener("click", onDoc, true);
    }
    document.addEventListener("click", onDoc, true);
  }, 0);
}

/* ── theme (tied to display prefs because theme changes update custom BG) ── */
export function toggleTheme() {
  var html = document.documentElement;
  var mode = html.getAttribute("data-mode");
  var next = mode === "dark" ? "light" : "dark";
  setThemePreference(next);
}
