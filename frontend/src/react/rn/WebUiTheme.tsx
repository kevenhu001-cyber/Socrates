/**
 * Web theme for shared React Native modules: colours are `var(--ui-*)`
 * references (so [data-mode] repaints without a React render) and the type
 * ladder follows the shell's text-size preference.
 */
import './rnwGlobal';
import { useEffect, useState, type ReactNode } from 'react';
import { uiColorsCssVars } from '@socrates/theme';
import { UiThemeProvider } from '@socrates/ui/primitives';
import { DISPLAY_PREFS_CHANGE_EVENT, displayPrefs } from '../../displayPrefs.ts';

/* The shell's text-size preference is stored as 1.125 = 100%. */
const BASE_FONT_PREF = 1.125;

export function useTypeScale(): number {
  const [scale, setScale] = useState(() => displayPrefs.font / BASE_FONT_PREF);
  useEffect(() => {
    const sync = () => setScale(displayPrefs.font / BASE_FONT_PREF);
    window.addEventListener(DISPLAY_PREFS_CHANGE_EVENT, sync);
    return () => window.removeEventListener(DISPLAY_PREFS_CHANGE_EVENT, sync);
  }, []);
  return scale;
}

/** Re-render on `socrates:langchange` so i18n copy follows the toggle. */
export function useLocaleRefresh(): void {
  const [, refresh] = useState(0);
  useEffect(() => {
    const onLanguageChange = () => refresh((revision) => revision + 1);
    document.addEventListener('socrates:langchange', onLanguageChange);
    return () => document.removeEventListener('socrates:langchange', onLanguageChange);
  }, []);
}

export function WebUiTheme({ children }: { children: ReactNode }) {
  const typeScale = useTypeScale();
  return <UiThemeProvider colors={uiColorsCssVars} typeScale={typeScale}>{children}</UiThemeProvider>;
}
