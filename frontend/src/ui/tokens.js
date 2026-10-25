/**
 * tokens.js — JS adapter for `src/ui/tokens.ts`.
 *
 * Legacy JavaScript modules need the exact page colors without importing the
 * TypeScript token module. These are the ladder's L1 canvas tones, kept in
 * lockstep with `styles/themes.css` and `packages/theme/src/tokens.ts`.
 */

/** Dark mode page background — ladder L1, a near-black rather than pure #000. */
export const DARK_PAGE_BACKGROUND = '#0a0a0a';

/** Light mode page background — ladder L2, one step below the paper. */
export const LIGHT_PAGE_BACKGROUND = '#fafafa';

/** Default fallback for the dark-mode user picker. */
export const DEFAULT_DARK_PICKER = DARK_PAGE_BACKGROUND;

/** Default fallback for the light-mode user picker. */
export const DEFAULT_LIGHT_PICKER = LIGHT_PAGE_BACKGROUND;

/** Mirror `resolveBackground()` in `src/ui/tokens.ts`. */
export function resolveBackground(mode) {
  return mode === 'light' ? LIGHT_PAGE_BACKGROUND : DARK_PAGE_BACKGROUND;
}
