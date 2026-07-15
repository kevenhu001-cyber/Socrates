/* ─── Display Preferences Module ───
   Text size, content width, background colors, grid toggle,
   accent color. Persisted in localStorage as `socrates-display`.
   ============================================================ */

import { applyCustomBg, removeCustomBg } from './util/colors.js';

/* ── constants ── */
export const DISPLAY_FONT_STEPS  = [1, 1.125, 1.25, 1.375];
export const DISPLAY_WIDTH_STEPS = [0.85,  1, 1.3,   1.7];
export const FONT_LABELS  = ["S","M","L","XL"];
export const WIDTH_LABELS = ["S","M","L","XL"];

/* ── state ── */
export var displayPrefs = { font: 1.125, width: 1, darkBg: "", lightBg: "", showGrid: true };

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
      if (p.showGrid === false) displayPrefs.showGrid = false;
    }
  } catch (e) { /* ignore */ }
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
  try { localStorage.setItem("socrates-display", JSON.stringify(displayPrefs)); } catch (e) { /* ignore */ }
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
  var darkInput = document.getElementById("displayPrefsBgDark");
  if (darkInput) darkInput.value = displayPrefs.darkBg || "#252220";
  var lightInput = document.getElementById("displayPrefsBgLight");
  if (lightInput) lightInput.value = displayPrefs.lightBg || "#ded6c8";
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

/* ── accent color ── */
export function setAccentColor(hue) {
  var num = parseInt(hue, 10);
  if (isNaN(num)) return;
  var root = document.documentElement;
  var sat = num === 0 || num === 0 ? "0%" : "77%";
  root.style.setProperty("--accent-000", num + " " + sat + " 62%");
  root.style.setProperty("--accent-100", num + " " + sat + " 62%");
  root.style.setProperty("--accent-900", num + " 40% 20%");
  try { localStorage.setItem("socrates-accent-hue", String(num)); } catch (e) { /* ignore */ }
  var swatches = document.querySelectorAll(".color-swatch");
  swatches.forEach(function (s) { s.classList.toggle("active", parseInt(s.dataset.hue, 10) === num); });
}

/* ── popover ── */
export function toggleDisplayPrefs() {
  var p = document.getElementById("displayPrefsPopover");
  if (!p) return;
  var btn = document.querySelector('[onclick="toggleDisplayPrefs()"]');
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

/* ── theme (tied to display prefs because toggleTheme calls applyDisplayPrefs) ── */
export function toggleTheme() {
  var html = document.documentElement;
  var mode = html.getAttribute("data-mode");
  var next = mode === "dark" ? "light" : "dark";
  html.setAttribute("data-mode", next);
  try { localStorage.setItem("socrates-theme", next); } catch (e) { /* ignore */ }
  /* Re-init Mermaid with the appropriate theme so future diagrams
     render correctly in the new mode. Existing SVGs keep their
     original colours (re-rendering them would be disruptive). */
  try {
    if (typeof mermaid !== "undefined" && mermaid.initialize) {
      mermaid.initialize({ startOnLoad: false, theme: next === "dark" ? "dark" : "default" });
    }
  } catch (_) { /* ignore */ }
  applyDisplayPrefs();
}
