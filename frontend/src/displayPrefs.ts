/* ─── Display Preferences Module ───
   Text size, content width, background colors, grid toggle.
   Persisted in localStorage as `socrates-display`.
   ============================================================ */

import { applyCustomBg, removeCustomBg, parseHexColor } from './util/colors.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";
import { reportSwallow as reportEmptyCatch } from './util/reportSwallow.ts';


/* ── constants ── */
export const DISPLAY_FONT_STEPS  = [1, 1.125, 1.25, 1.375];
export const DISPLAY_WIDTH_STEPS = [0.85,  1, 1.3,   1.7];
export const FONT_LABELS  = ["S","M","L","XL"];
export const WIDTH_LABELS = ["S","M","L","XL"];
export const THEME_PREFERENCES = ["system", "light", "dark"];
export const THEME_STYLES = ["socrates", "philosophy"];

/* ── state ── */
interface DisplayPreferences {
  font: number;
  width: number;
  darkBg: string;
  lightBg: string;
  showGrid: boolean;
}
type ThemePreference = 'system' | 'light' | 'dark';
type ThemeStyle = 'socrates' | 'philosophy';
type ThemeMode = 'light' | 'dark';

export const displayPrefs: DisplayPreferences = { font: 1.125, width: 1, darkBg: "", lightBg: "", showGrid: false };

let _systemThemeQuery: MediaQueryList|null = null;
export const DISPLAY_PREFS_CHANGE_EVENT = 'socrates:display-prefs-change';
export const DISPLAY_PREFS_TOGGLE_EVENT = 'socrates:display-prefs-toggle';

function isThemePreference(value: string | null): value is ThemePreference {
  return value !== null && THEME_PREFERENCES.includes(value);
}

function isThemeStyle(value: string | null): value is ThemeStyle {
  return value !== null && THEME_STYLES.includes(value);
}

export function getThemeStyle() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (isThemeStyle(attr)) return attr;
  try {
    const saved = localStorage.getItem("socrates-theme-style");
    if (isThemeStyle(saved)) return saved;
  } catch (_) { /* empty-catch: intentional — theme style preference read is best-effort */ }
  return "socrates";
}

export function setThemeStyle(style: string | null) {
  if (!isThemeStyle(style)) return;
  document.documentElement.setAttribute("data-theme", style);
  try { localStorage.setItem("socrates-theme-style", style); } catch (_) { /* empty-catch: intentional — theme style preference write is best-effort */ }
  applyDisplayPrefs();
}

function systemThemeMode(): ThemeMode {
  try {
    return browserWindow.matchMedia && browserWindow.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch (_) {
    return "dark";
  }
}

export function getThemePreference() {
  const attr = document.documentElement.getAttribute("data-theme-preference");
  if (isThemePreference(attr)) return attr;
  try {
    const saved = localStorage.getItem("socrates-theme");
    if (isThemePreference(saved)) return saved;
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: displayPrefs.ts:79', 'expected');
    /* ignore */
  }
  return "dark";
}

export function resolveThemeMode(preference: string | null): ThemeMode {
  return preference === "system" ? systemThemeMode() : (preference === "light" ? "light" : "dark");
}

function syncMermaidTheme(mode: ThemeMode) {
  try {
    if (typeof browserWindow.mermaid !== "undefined" && browserWindow.mermaid.initialize) {
      browserWindow.mermaid.initialize({ startOnLoad: false, theme: mode === "dark" ? "dark" : "default" });
    }
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: displayPrefs.ts:92', 'expected');
    /* ignore */
  }
}

export function syncThemeUI() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DISPLAY_PREFS_CHANGE_EVENT));
}

function syncBrowserChromeColor(mode: ThemeMode) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  let color = "";
  try {
    color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: displayPrefs.ts:129', 'expected');
    /* computed style unavailable during boot — use the fallback */
  }
  if (!color || color.indexOf("var(") !== -1) {
    color = mode === "dark" ? "#121110" : "#f7f4ee";
  }
  meta.setAttribute("content", color);
}

function setEffectiveThemeMode(mode: ThemeMode) {
  const html = document.documentElement;
  html.setAttribute("data-mode", mode);
  html.style.colorScheme = mode;
  syncMermaidTheme(mode);
  syncBrowserChromeColor(mode);
}

function watchSystemTheme() {
  if (_systemThemeQuery || !browserWindow.matchMedia) return;
  try {
    _systemThemeQuery = browserWindow.matchMedia("(prefers-color-scheme: dark)");
    const onChange = function () {
      if (getThemePreference() !== "system") return;
      setEffectiveThemeMode(resolveThemeMode("system"));
      applyDisplayPrefs();
    };
    if (typeof _systemThemeQuery.addEventListener === "function") {
      _systemThemeQuery.addEventListener("change", onChange);
    } else if (typeof _systemThemeQuery.addListener === "function") {
      _systemThemeQuery.addListener(onChange);
    }
  } catch (_) {
    reportEmptyCatch(_, 'empty catch: displayPrefs.ts:159', 'expected');
    /* ignore */
  }
}

export function initTheme() {
  const preference = getThemePreference();
  document.documentElement.setAttribute("data-theme-preference", preference!);
  const style = getThemeStyle();
  document.documentElement.setAttribute("data-theme", style!);
  setEffectiveThemeMode(resolveThemeMode(preference));
  watchSystemTheme();
  syncThemeUI();
}

export function setThemePreference(preference: string | null) {
  if (!isThemePreference(preference)) return;
  document.documentElement.setAttribute("data-theme-preference", preference);
  try { localStorage.setItem("socrates-theme", preference); } catch (_) {
    reportEmptyCatch(_, 'empty catch: displayPrefs.ts:189', 'expected');
    /* ignore */
  }
  setEffectiveThemeMode(resolveThemeMode(preference));
  applyDisplayPrefs();
}

/* ── helpers ── */
export function loadDisplayPrefs() {
  try {
    const raw = localStorage.getItem("socrates-display");
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p.font === "number" && p.font > 0) displayPrefs.font = p.font;
      if (typeof p.width === "number" && p.width > 0) displayPrefs.width = p.width;
      if (typeof p.darkBg === "string") displayPrefs.darkBg = p.darkBg;
      if (typeof p.lightBg === "string") displayPrefs.lightBg = p.lightBg;
      if (p.showGrid === true) displayPrefs.showGrid = true;
      else displayPrefs.showGrid = false;
    }
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: displayPrefs.ts:207', 'expected');
    /* ignore */
  }
  /* One-time cleanup: the accent-colour picker was removed, so drop any
     persisted accent preference and never let it resurface. */
  try {
    localStorage.removeItem("socrates-accent-hex");
    localStorage.removeItem("socrates-accent-hue");
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: displayPrefs.ts:213', 'expected');
    /* ignore */
  }
  /* One-time migration (bgMigratedV1): earlier builds shipped warm/green
     default background picks (#252220 / #ded6c8) and let users store any
     hue, which fought the neutral ChatGPT-black theme ("跑色"). Strip any
     custom bg whose saturation is non-trivial so those users fall back to
     the neutral theme tokens. Runs once; users who deliberately pick a
     color afterwards are never touched again. */
  try {
    if (localStorage.getItem("socrates-bg-migrated-v1") !== "1") {
      let stripped = false;
      (["darkBg", "lightBg"] as const).forEach(function (field) {
        const hex = displayPrefs[field];
        if (typeof hex === "string" && /^#?[0-9a-fA-F]{3,6}$/.test(hex.trim())) {
          const hsl = parseHexColor(hex.trim());
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
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: displayPrefs.ts:237', 'expected');
    /* ignore */
  }
  applyDisplayPrefs();
}

export function applyDisplayPrefs() {
  document.documentElement.style.setProperty("--app-font-scale", String(displayPrefs.font));
  document.documentElement.style.setProperty("--app-width-scale", String(displayPrefs.width));
  const mode: ThemeMode = document.documentElement.getAttribute("data-mode") === "light" ? "light" : "dark";
  const customHex = mode === "dark" ? displayPrefs.darkBg : displayPrefs.lightBg;
  if (customHex) {
    applyCustomBg(customHex, mode);
  } else {
    removeCustomBg();
  }
  document.documentElement.dataset.showGrid = displayPrefs.showGrid === false ? "false" : "true";
  /* After font/width change, layout shifts — keep pinned users at bottom */
  if (typeof browserWindow.scrollToBottomIfPinned === "function") {
    browserWindow.scrollToBottomIfPinned();
  }
  syncThemeUI();
}

export function saveDisplayPrefs() {
  try { localStorage.setItem("socrates-display", JSON.stringify(displayPrefs)); } catch (error) {
    reportEmptyCatch(error, 'empty catch: displayPrefs.ts:260', 'expected');
    /* ignore */
  }
}

/* ── font / width ── */
export function setDisplayFont(step: number) {
  displayPrefs.font = step;
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function setDisplayWidth(step: number) {
  displayPrefs.width = step;
  applyDisplayPrefs();
  saveDisplayPrefs();
}

/* ── background colors ── */
export function setBackgroundColor(hex: string) {
  displayPrefs.darkBg = hex || "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function setBackgroundDark(hex: string) {
  displayPrefs.darkBg = hex || "";
  applyDisplayPrefs();
  saveDisplayPrefs();
}

export function setBackgroundLight(hex: string) {
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

/* ── popover ── */
export function toggleDisplayPrefs() {
  document.dispatchEvent(new Event(DISPLAY_PREFS_TOGGLE_EVENT));
}

/* ── theme (tied to display prefs because theme changes update custom BG) ── */
export function toggleTheme() {
  const html = document.documentElement;
  const mode = html.getAttribute("data-mode");
  const next = mode === "dark" ? "light" : "dark";
  setThemePreference(next);
}
