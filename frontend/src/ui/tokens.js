/**
 * tokens.js — JS adapter for `src/ui/tokens.ts`.
 *
 * Legacy JavaScript modules need the exact first-frame page colors without
 * importing the TypeScript token module. Socrates Design System v2 follows
 * Lobe UI's default `colorBgLayout` values for these fallbacks.
 */

/** Dark mode page background; Lobe default colorBgLayout. */
export const DARK_PAGE_BACKGROUND = '#000000';

/** Light mode page background; Lobe default colorBgLayout. */
export const LIGHT_PAGE_BACKGROUND = '#f8f8f8';

/** Default fallback for the dark-mode user picker. */
export const DEFAULT_DARK_PICKER = DARK_PAGE_BACKGROUND;

/** Default fallback for the light-mode user picker. */
export const DEFAULT_LIGHT_PICKER = LIGHT_PAGE_BACKGROUND;

/** Mirror `resolveBackground()` in `src/ui/tokens.ts`. */
export function resolveBackground(mode) {
  return mode === 'light' ? LIGHT_PAGE_BACKGROUND : DARK_PAGE_BACKGROUND;
}
