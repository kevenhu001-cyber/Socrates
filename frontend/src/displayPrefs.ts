/* ─── Display Preferences Module ───
   Text size, content width, background colors, grid toggle.
   Persisted in localStorage as `socrates-display`.
   ============================================================ */

import { applyCustomBg, removeCustomBg, parseHexColor } from './util/colors.ts';
import { DEFAULT_DARK_PICKER, DEFAULT_LIGHT_PICKER } from './ui/tokens.ts';
import { restingRect } from './ui/pressFeedback.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";


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

export let displayPrefs: DisplayPreferences = { font: 1.125, width: 1, darkBg: "", lightBg: "", showGrid: false };

let _systemThemeQuery: MediaQueryList|null = null;
let _themeControlsDelegated = false;

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
  syncThemeUI();
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
  } catch (_) { /* ignore */ }
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
  } catch (_) { /* ignore */ }
}

export function syncThemeUI() {
  const html = document.documentElement;
  const preference = html.getAttribute("data-theme-preference") || getThemePreference();
  const options = document.querySelectorAll("[data-theme-option]");
  options.forEach(function (option) {
    const active = option.getAttribute("data-theme-option") === preference;
    option.classList.toggle("on", active);
    option.setAttribute("aria-checked", active ? "true" : "false");
  });
  const currentStyle = html.getAttribute("data-theme") || getThemeStyle();
  const styleOptions = document.querySelectorAll("[data-theme-style-option]");
  styleOptions.forEach(function (option) {
    const active = option.getAttribute("data-theme-style-option") === currentStyle;
    option.classList.toggle("on", active);
    option.setAttribute("aria-checked", active ? "true" : "false");
  });
  /* P_display-prefs-no-dup — the theme row is a radiogroup, so the checked
     radio already states the current theme. The old #displayThemeModeLabel
     readout repeated the same word next to it. */
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.setAttribute("data-theme-preference", preference!);
    const toggleLabel = typeof browserWindow.t === "function" ? browserWindow.t("display.themeToggle") : "Toggle theme";
    toggle.setAttribute("title", toggleLabel);
    toggle.setAttribute("aria-label", toggleLabel);
  }
}

function syncBrowserChromeColor(mode: ThemeMode) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  let color = "";
  try {
    color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  } catch (_) { /* computed style unavailable during boot — use the fallback */ }
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
  syncThemeUI();
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
  } catch (_) { /* ignore */ }
}

export function initTheme() {
  const preference = getThemePreference();
  document.documentElement.setAttribute("data-theme-preference", preference!);
  const style = getThemeStyle();
  document.documentElement.setAttribute("data-theme", style!);
  setEffectiveThemeMode(resolveThemeMode(preference));
  watchSystemTheme();
  if (!_themeControlsDelegated) {
    document.addEventListener("click", function (event) {
      const eventTarget = event.target;
      const target = eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null;
      const themeOption = target && target.closest("[data-theme-option]");
      if (themeOption) {
        setThemePreference(themeOption.getAttribute("data-theme-option"));
        return;
      }
      const styleOption = target && target.closest("[data-theme-style-option]");
      if (styleOption) setThemeStyle(styleOption.getAttribute("data-theme-style-option"));
    });
    _themeControlsDelegated = true;
  }
  syncThemeUI();
}

export function setThemePreference(preference: string | null) {
  if (!isThemePreference(preference)) return;
  document.documentElement.setAttribute("data-theme-preference", preference);
  try { localStorage.setItem("socrates-theme", preference); } catch (_) { /* ignore */ }
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
  } catch { /* ignore */ }
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
  syncDisplayPrefsUI();
  /* After font/width change, layout shifts — keep pinned users at bottom */
  if (typeof browserWindow.scrollToBottomIfPinned === "function") {
    browserWindow.scrollToBottomIfPinned();
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
  const fWrap = document.getElementById("displayPrefsFontSegs");
  if (fWrap) Array.from(fWrap.children).forEach(function (b) {
    const active = parseFloat((b as HTMLElement).dataset.font!) === displayPrefs.font;
    b.classList.toggle("on", active);
    b.setAttribute("aria-checked", active ? "true" : "false");
  });
  const wWrap = document.getElementById("displayPrefsWidthSegs");
  if (wWrap) Array.from(wWrap.children).forEach(function (b) {
    const active = parseFloat((b as HTMLElement).dataset.width!) === displayPrefs.width;
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
  const sWrap = document.getElementById("displayThemeStyleSegs");
  const tWrap = document.getElementById("displayThemeSegs");
  [fWrap, wWrap, sWrap, tWrap].forEach(function (wrap) {
    if (!wrap) return;
    const onBtn = wrap.querySelector(".display-prefs-seg.on");
    if (!onBtn) return;
    /* If we already have the seg vars set, the transition will
       animate; otherwise wait one frame so initial layout is in
       place (avoids a 0,0 flash on first reveal). */
    const hasVars = wrap.style.getPropertyValue("--seg-x") && wrap.style.getPropertyValue("--seg-w");
    const apply = function () {
      const x = (onBtn as HTMLElement).offsetLeft;
      const w = (onBtn as HTMLElement).offsetWidth;
      if (w === 0) return;
      wrap.style.setProperty("--seg-x", x + "px");
      wrap.style.setProperty("--seg-w", w + "px");
    };
    if (!hasVars) requestAnimationFrame(apply);
    else apply();
  });
  const darkInput = document.getElementById("displayPrefsBgDark");
  if (darkInput) (darkInput as HTMLInputElement).value = displayPrefs.darkBg || DEFAULT_DARK_PICKER;
  const lightInput = document.getElementById("displayPrefsBgLight");
  if (lightInput) (lightInput as HTMLInputElement).value = displayPrefs.lightBg || DEFAULT_LIGHT_PICKER;
  const gt = document.getElementById("gridToggle");
  if (gt) {
    const gridOn = displayPrefs.showGrid !== false;
    gt.classList.toggle("on", gridOn);
    gt.setAttribute("aria-checked", gridOn ? "true" : "false");
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

/* React owns the display-preferences controls. These document-level bridges
 * keep the long-standing ids and external toggleDisplayPrefs() callers
 * working after the component mounts, without binding to short-lived nodes. */
export function mountDisplayPrefsListeners(){
  const marker = document.documentElement;
  if (marker.dataset.displayPrefsListenersMounted === "1") return null;
  marker.dataset.displayPrefsListenersMounted = "1";

  function onClick(event: Event) {
    const eventTarget = event.target;
    const target = eventTarget instanceof Element ? eventTarget : eventTarget instanceof Node ? eventTarget.parentElement : null;
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
    const font = target.closest("#displayPrefsFontSegs [data-font]");
    if (font) { setDisplayFont(parseFloat(String((font as HTMLElement).dataset.font))); return; }
    const width = target.closest("#displayPrefsWidthSegs [data-width]");
    if (width) { setDisplayWidth(parseFloat(String((width as HTMLElement).dataset.width))); return; }
    if (target.closest("#gridToggle")) { event.preventDefault(); toggleGrid(); return; }
    if (target.closest("#displayPrefsBgDarkReset")) { event.preventDefault(); resetBackgroundDark(); return; }
    if (target.closest("#displayPrefsBgLightReset")) { event.preventDefault(); resetBackgroundLight(); }
  }

  function onInput(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    /* React's onChange owns native picker changes. This fallback preserves
       callers that dispatch the long-standing bubbling `input` event. */
    if (target.id === "displayPrefsBgDark" && (target as HTMLInputElement).value !== displayPrefs.darkBg) {
      setBackgroundDark((target as HTMLInputElement).value);
    } else if (target.id === "displayPrefsBgLight" && (target as HTMLInputElement).value !== displayPrefs.lightBg) {
      setBackgroundLight((target as HTMLInputElement).value);
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
  const p = document.getElementById("displayPrefsPopover");
  if (!p) return;
  const btn = document.getElementById("displayPrefsBtn");
  const isOpen = !p.classList.contains("hidden");
  if (isOpen) { p.classList.add("hidden"); return; }
  if (btn) {
    const r = restingRect(btn); /* not the mid-press box (ui/pressFeedback.ts) */
    const popW = 240;
    let left = r.right - popW;
    if (left < 8) left = 8;
    const bottom = browserWindow.innerHeight - r.top + 8;
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
    function onDoc(e: Event) {
      if (p!.contains((e.target as Node | null))) return;
      if (btn && btn.contains((e.target as Node | null))) return;
      p!.classList.add("hidden");
      document.removeEventListener("click", onDoc, true);
    }
    document.addEventListener("click", onDoc, true);
  }, 0);
}

/* ── theme (tied to display prefs because theme changes update custom BG) ── */
export function toggleTheme() {
  const html = document.documentElement;
  const mode = html.getAttribute("data-mode");
  const next = mode === "dark" ? "light" : "dark";
  setThemePreference(next);
}
