/* ─── Display Preferences Module ───
   Text size, content width, background colors, grid toggle.
   Persisted in localStorage as `socrates-display`.
   ============================================================ */

import { applyCustomBg, removeCustomBg, parseHexColor } from './util/colors.js';
import { DEFAULT_DARK_PICKER, DEFAULT_LIGHT_PICKER } from './ui/tokens.js';

/* ── constants ── */
export const DISPLAY_FONT_STEPS  = [1, 1.125, 1.25, 1.375];
export const DISPLAY_WIDTH_STEPS = [0.85,  1, 1.3,   1.7];
export const FONT_LABELS  = ["S","M","L","XL"];
export const WIDTH_LABELS = ["S","M","L","XL"];
export const THEME_PREFERENCES = ["system", "light", "dark"];

/* ── state ── */
export var displayPrefs = { font: 1.125, width: 1, darkBg: "", lightBg: "", showGrid: false };

var _systemThemeQuery = null;

function isThemePreference(value) {
  return THEME_PREFERENCES.indexOf(value) !== -1;
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
  var label = document.getElementById("displayThemeModeLabel");
  if (label) {
    var key = preference === "system" ? "display.themeSystem" : (preference === "light" ? "display.themeLight" : "display.themeDark");
    label.textContent = typeof window.t === "function" ? window.t(key) : preference;
  }
  var toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.setAttribute("data-theme-preference", preference);
    var toggleLabel = typeof window.t === "function" ? window.t("display.themeToggle") : "Toggle theme";
    toggle.setAttribute("title", toggleLabel);
    toggle.setAttribute("aria-label", toggleLabel);
  }
}

function setEffectiveThemeMode(mode) {
  var html = document.documentElement;
  html.setAttribute("data-mode", mode);
  html.style.colorScheme = mode;
  syncMermaidTheme(mode);
  syncThemeUI();
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
  setEffectiveThemeMode(resolveThemeMode(preference));
  watchSystemTheme();
  var options = document.querySelectorAll("[data-theme-option]");
  options.forEach(function (option) {
    if (option.dataset.themeWired === "true") return;
    option.dataset.themeWired = "true";
    option.addEventListener("click", function () {
      setThemePreference(option.getAttribute("data-theme-option"));
    });
  });
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
  var fLabel = document.getElementById("displayPrefsFontLabel");
  var wLabel = document.getElementById("displayPrefsWidthLabel");
  if (fLabel) {
    var fi = DISPLAY_FONT_STEPS.indexOf(displayPrefs.font);
    fLabel.textContent = fi >= 0 ? FONT_LABELS[fi] : "M";
  }
  if (wLabel) {
    var wi = DISPLAY_WIDTH_STEPS.indexOf(displayPrefs.width);
    wLabel.textContent = wi >= 0 ? WIDTH_LABELS[wi] : "M";
  }
  var fWrap = document.getElementById("displayPrefsFontSegs");
  if (fWrap) Array.from(fWrap.children).forEach(function (b) {
    b.classList.toggle("on", parseFloat(b.dataset.font) === displayPrefs.font);
  });
  var wWrap = document.getElementById("displayPrefsWidthSegs");
  if (wWrap) Array.from(wWrap.children).forEach(function (b) {
    b.classList.toggle("on", parseFloat(b.dataset.width) === displayPrefs.width);
  });
  /* Drive the sliding ::before indicator on each segs wrapper.
     After toggling .on, the active button's offsetLeft/offsetWidth
     reflects its new layout position — we copy those to CSS custom
     properties so the indicator animates between segments instead
     of snapping. Uses rAF on the first sync so the indicator lands
     at the correct position before the popover reveals, avoiding a
     flash from (0,0) to the real coordinates. */
  [fWrap, wWrap].forEach(function (wrap) {
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
  if (gt) gt.classList.toggle("on", displayPrefs.showGrid !== false);
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
  displayPrefs.showGrid = displayPrefs.showGrid === false ? true : false;
  applyDisplayPrefs();
  saveDisplayPrefs();
}

/* The display-preferences popover is legacy markup, but it owns its own
 * controls. Mounting the listeners here keeps theme/background
 * changes independent from the document-wide data-action dispatcher. */
export function mountDisplayPrefsListeners(){
  var popover=document.getElementById("displayPrefsPopover");
  var button=document.getElementById("displayPrefsBtn");
  if(!popover||!button||popover.dataset.displayPrefsListenersMounted==="1")return null;
  popover.dataset.displayPrefsListenersMounted="1";
  var cleanups=[];

  function bind(el,type,handler){
    if(!el)return;
    el.addEventListener(type,handler);
    cleanups.push(function(){el.removeEventListener(type,handler)});
  }
  function bindAll(selector,type,handler){
    popover.querySelectorAll(selector).forEach(function(el){bind(el,type,handler)});
  }

  bind(button,"click",function(e){
    e.preventDefault();
    toggleDisplayPrefs();
  });
  bind(document.getElementById("themeToggle"),"click",function(e){
    e.preventDefault();
    toggleTheme();
  });
  /* Keep clicks inside the popover from reaching unrelated document
     delegates. toggleDisplayPrefs()'s capture-phase outside listener still
     sees the event first and explicitly ignores targets inside this host. */
  bind(popover,"click",function(e){e.stopPropagation()});

  bindAll("#displayPrefsFontSegs [data-font]","click",function(e){
    setDisplayFont(parseFloat(e.currentTarget.dataset.font));
  });
  bindAll("#displayPrefsWidthSegs [data-width]","click",function(e){
    setDisplayWidth(parseFloat(e.currentTarget.dataset.width));
  });
  bind(document.getElementById("gridToggle"),"click",function(e){
    e.preventDefault();
    toggleGrid();
  });
  bind(document.getElementById("displayPrefsBgDark"),"input",function(e){
    setBackgroundDark(e.currentTarget.value);
  });
  bind(document.getElementById("displayPrefsBgDarkReset"),"click",function(e){
    e.preventDefault();
    resetBackgroundDark();
  });
  bind(document.getElementById("displayPrefsBgLight"),"input",function(e){
    setBackgroundLight(e.currentTarget.value);
  });
  bind(document.getElementById("displayPrefsBgLightReset"),"click",function(e){
    e.preventDefault();
    resetBackgroundLight();
  });

  return function unmountDisplayPrefsListeners(){
    cleanups.splice(0).forEach(function(cleanup){cleanup()});
    if(popover.dataset.displayPrefsListenersMounted==="1")delete popover.dataset.displayPrefsListenersMounted;
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
    var r = btn.getBoundingClientRect();
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
