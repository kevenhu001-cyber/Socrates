// @ts-nocheck
/**
 * tokens.js — JS adapter for `src/ui/tokens.ts`.
 *
 * The legacy `displayPrefs.js` and other `.js` modules cannot rely
 * on a TypeScript-only types file at parse time. This shim mirrors
 * the runtime values that the JS side actually needs (the hex page
 * background colors used by the boot-time Capacitor paint and the
 * fallback values for the user-editable background-color pickers).
 *
 * Keep the values in sync with `src/ui/tokens.ts`. A drift check
 * could be added in M2 if more callers depend on this surface.
 */

/** Dark mode page background; matches darkPalette.bg.page in tokens.ts. */
export const DARK_PAGE_BACKGROUND = '#000000';

/** Light mode page background; matches lightPalette.bg.page in tokens.ts. */
export const LIGHT_PAGE_BACKGROUND = '#ffffff';

/** Default fallback for the dark-mode user picker. */
export const DEFAULT_DARK_PICKER = '#000000';

/** Default fallback for the light-mode user picker. */
export const DEFAULT_LIGHT_PICKER = '#ffffff';

/**
 * Resolve the effective page background for a given mode. Mirrors
 * `resolveBackground()` in `src/ui/tokens.ts` for the JS side.
 */
export function resolveBackground(mode) {
  return mode === 'light' ? LIGHT_PAGE_BACKGROUND : DARK_PAGE_BACKGROUND;
}
