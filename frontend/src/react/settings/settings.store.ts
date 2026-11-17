import { create } from 'zustand';
import {
  DISPLAY_PREFS_CHANGE_EVENT,
  displayPrefs,
  getThemePreference,
  getThemeStyle,
  resetBackgroundDark,
  resetBackgroundLight,
  setBackgroundDark,
  setBackgroundLight,
  setDisplayFont,
  setDisplayWidth,
  setThemePreference,
  setThemeStyle,
  setGrid,
} from '../../displayPrefs.ts';
import { getCurrentLanguage, type AppLanguage } from '../../i18n/languageState.ts';

/**
 * settings/store.ts — one read model for the settings surface.
 *
 * The panes used to read preferences straight off the DOM (`data-theme`,
 * `data-theme-preference`) and drive theme changes by clicking hidden legacy
 * buttons (`document.querySelector('[data-theme-option]').click()`), with a
 * MutationObserver per pane to stay in sync. That is why a toggle could take a
 * frame to appear and why the value could disagree with the account
 * preference: three writers, no single reader. This store is that reader, and
 * every action writes through the displayPreference module that already owns
 * persistence and the DOM attribute pass.
 */
export interface SettingsPreferencesState {
  theme: string;
  themeStyle: string;
  font: number;
  width: number;
  showGrid: boolean;
  darkBg: string;
  lightBg: string;
}

function readPreferences(): SettingsPreferencesState {
  return {
    theme: getThemePreference() || 'system',
    themeStyle: getThemeStyle() || 'socrates',
    font: displayPrefs.font,
    width: displayPrefs.width,
    showGrid: displayPrefs.showGrid !== false,
    darkBg: displayPrefs.darkBg || '',
    lightBg: displayPrefs.lightBg || '',
  };
}

export const useSettingsPreferencesStore = create<SettingsPreferencesState>(() => readPreferences());

function sync(): void {
  useSettingsPreferencesStore.setState(readPreferences());
}

let installed = false;

/** Mirror changes that originate outside the modal (theme menu, account sync). */
export function installSettingsPreferencesSync(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try { window.addEventListener(DISPLAY_PREFS_CHANGE_EVENT, sync); } catch {
    /* empty-catch: intentional — non-DOM hosts have no event target. */
  }
  if (typeof MutationObserver === 'function') {
    try {
      new MutationObserver(sync).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-theme-preference'],
      });
    } catch {
      /* empty-catch: intentional — a detached document cannot be observed. */
    }
  }
}

/** Write-through actions: local paint is immediate, persistence is the module's. */
export const settingsPreferenceActions = {
  setTheme(theme: string): void { setThemePreference(theme); sync(); },
  setThemeStyle(style: string): void { setThemeStyle(style); sync(); },
  setFont(step: number): void { setDisplayFont(step); sync(); },
  setWidth(step: number): void { setDisplayWidth(step); sync(); },
  setGrid(show: boolean): void { setGrid(show); sync(); },
  setDarkBackground(hex: string): void { setBackgroundDark(hex); sync(); },
  setLightBackground(hex: string): void { setBackgroundLight(hex); sync(); },
  resetDarkBackground(): void { resetBackgroundDark(); sync(); },
  resetLightBackground(): void { resetBackgroundLight(); sync(); },
};

/** Language is owned by the i18n layer; this is only its current value. */
export function currentSettingsLanguage(): AppLanguage {
  return getCurrentLanguage();
}

installSettingsPreferencesSync();
