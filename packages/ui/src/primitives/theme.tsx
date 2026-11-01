/**
 * Theme context for the RN-1 primitives.
 *
 * Native clients hand in a concrete palette (`uiColors.light` / `.dark`).
 * The web shell hands in `uiColorsCssVars`, whose values are `var(--ui-*)`
 * references into the generated stylesheet, so the active `[data-mode]`
 * paints the components and a theme switch costs no React render.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { uiColors, uiFont, type UiColors } from '@socrates/theme';

export interface UiThemeValue {
  readonly colors: UiColors;
  /** Font family for text. Web: the CSS stack. Native: a registered face. */
  readonly fontFamily: string;
  /** Multiplier on the type ladder (the web shell's text-size preference). */
  readonly typeScale: number;
}

const defaultTheme: UiThemeValue = { colors: uiColors.light, fontFamily: uiFont.sans, typeScale: 1 };

const UiThemeContext = createContext<UiThemeValue>(defaultTheme);

export function UiThemeProvider({ colors, fontFamily, typeScale, children }: {
  colors: UiColors;
  fontFamily?: string;
  typeScale?: number;
  children: ReactNode;
}) {
  return (
    <UiThemeContext.Provider value={{ colors, fontFamily: fontFamily ?? uiFont.sans, typeScale: typeScale ?? 1 }}>
      {children}
    </UiThemeContext.Provider>
  );
}

export function useUiTheme(): UiThemeValue {
  return useContext(UiThemeContext);
}
