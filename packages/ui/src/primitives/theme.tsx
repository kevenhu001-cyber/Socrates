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
import type { UiIconRenderer } from './UiIcon';

/** The weights the type ladder can ask for. */
export type UiFontWeight = '400' | '500' | '600' | '700';

export interface UiThemeValue {
  readonly colors: UiColors;
  /** Font family for text. Web: the CSS stack. Native: a registered face. */
  readonly fontFamily: string;
  /**
   * One face per weight, for hosts that register static font files (native).
   * When the map is present the type ladder picks the matching face instead
   * of asking the platform for a weight the family does not have — which
   * makes iOS fall back to the system face. Web hosts leave it unset and
   * keep the CSS family + weight pairing.
   */
  readonly fontFamilies?: Partial<Record<UiFontWeight, string>>;
  /** Multiplier on the type ladder (the web shell's text-size preference). */
  readonly typeScale: number;
  /** Draws `UiIcon` glyph data (web: inline svg). Null draws a blank box. */
  readonly iconRenderer: UiIconRenderer | null;
}

const defaultTheme: UiThemeValue = { colors: uiColors.light, fontFamily: uiFont.sans, typeScale: 1, iconRenderer: null };

const UiThemeContext = createContext<UiThemeValue>(defaultTheme);

export function UiThemeProvider({ colors, fontFamily, fontFamilies, typeScale, iconRenderer, children }: {
  colors: UiColors;
  fontFamily?: string;
  fontFamilies?: Partial<Record<UiFontWeight, string>>;
  typeScale?: number;
  iconRenderer?: UiIconRenderer | null;
  children: ReactNode;
}) {
  return (
    <UiThemeContext.Provider value={{
      colors,
      fontFamily: fontFamily ?? uiFont.sans,
      ...(fontFamilies ? { fontFamilies } : {}),
      typeScale: typeScale ?? 1,
      iconRenderer: iconRenderer ?? null,
    }}>
      {children}
    </UiThemeContext.Provider>
  );
}

export function useUiTheme(): UiThemeValue {
  return useContext(UiThemeContext);
}
