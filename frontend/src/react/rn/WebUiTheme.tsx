/**
 * Web theme for shared React Native modules: colours are `var(--ui-*)`
 * references (so [data-mode] repaints without a React render) and the type
 * ladder follows the shell's text-size preference.
 */
import './rnwGlobal';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getLocaleRevision, subscribeLocale } from '../../i18n/localeRevision.ts';
import { uiColorsCssVars } from '@socrates/theme';
import { UiThemeProvider } from '@socrates/ui/primitives';
import { DISPLAY_PREFS_CHANGE_EVENT, displayPrefs } from '../../displayPrefs.ts';
import { WebIconRenderer } from './WebIconRenderer';

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

/**
 * Re-render when the locale changes. Reads the locale revision store instead
 * of a DOM event so a surface cannot forget to subscribe — the transcript's
 * tool rows, thinking captions and visualization chrome all go through this.
 */
export function useLocaleRefresh(): void {
  useSyncExternalStore(subscribeLocale, getLocaleRevision, getLocaleRevision);
}

export function WebUiTheme({ children }: { children: ReactNode }) {
  const typeScale = useTypeScale();
  return (
    <UiThemeProvider colors={uiColorsCssVars} typeScale={typeScale} iconRenderer={WebIconRenderer}>
      {children}
    </UiThemeProvider>
  );
}
